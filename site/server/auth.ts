import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { SiteConfig } from './config.ts';
import type { Db } from './db.ts';
import type { Mailer } from './mail.ts';

/**
 * Sign-in for the site: email magic links, Google and GitHub. Accounts are matched by verified email, so the
 * same person signing in different ways lands in one account. Only hashes of links and sessions are stored.
 */

export interface Account {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
}

export type OAuthProvider = 'google' | 'github';

const SESSION_COOKIE = 'site_session';
const OAUTH_COOKIE = 'site_oauth';
const SESSION_DAYS = 30;
const MAGIC_MINUTES = 15;
const OAUTH_MINUTES = 10;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export const newToken = () => randomBytes(32).toString('base64url');
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Only same-site paths, so a link cannot bounce people to another site after signing in. */
export const safeNext = (next: unknown) => (typeof next === 'string' && /^\/(?!\/)[^\s\\]*$/.test(next) ? next.slice(0, 300) : '/');

export function readCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0) out[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1).trim());
  }
  return out;
}

class RateLimit {
  private hits = new Map<string, number[]>();
  private limit: number;
  private windowMs: number;
  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }
  allow(key: string, now: number) {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) return false;
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

interface Identity {
  provider: 'email' | OAuthProvider;
  subject: string;
  email: string;
  name: string;
  avatarUrl: string;
}

export class AuthError extends Error {}

export class Auth {
  private perEmail = new RateLimit(5, 3_600_000);
  private perIp = new RateLimit(20, 3_600_000);

  private db: Db;
  private config: SiteConfig;
  private mailer: Mailer;
  private fetchImpl: typeof fetch;
  private now: () => Date;

  constructor(db: Db, config: SiteConfig, mailer: Mailer, fetchImpl: typeof fetch = fetch, now: () => Date = () => new Date()) {
    this.db = db;
    this.config = config;
    this.mailer = mailer;
    this.fetchImpl = fetchImpl;
    this.now = now;
  }

  get secure() {
    return this.config.publicUrl.startsWith('https://');
  }

  providers() {
    return { email: true, google: Boolean(this.config.google), github: Boolean(this.config.github) };
  }

  // ── accounts ───────────────────────────────────────────────
  private async handleFor(tx: Pick<Db, 'query'>, email: string) {
    const base =
      email
        .split('@')[0]
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24) || 'user';
    for (let n = 0; ; n++) {
      const handle = n ? `${base}-${n + 1}` : base;
      const taken = await tx.query('SELECT 1 FROM profiles WHERE handle = $1', [handle]);
      if (!taken.length) return handle;
    }
  }

  /** Finds the account for a verified identity, linking by email or creating one. */
  async signIn(identity: Identity): Promise<Account> {
    const email = identity.email.trim().toLowerCase();
    const admin = this.config.adminEmails.includes(email);
    const account = await this.db.transaction(async (tx) => {
      const linked = await tx.query<Account>(
        'SELECT a.* FROM auth_identities i JOIN accounts a ON a.id = i.account_id WHERE i.provider = $1 AND i.subject = $2',
        [identity.provider, identity.subject],
      );
      if (linked[0]) return linked[0];
      let [existing] = await tx.query<Account>('SELECT * FROM accounts WHERE email = $1', [email]);
      if (!existing) {
        const id = `acc_${randomBytes(9).toString('base64url')}`;
        [existing] = await tx.query<Account>(
          'INSERT INTO accounts (id, email, name, avatar_url, role) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [id, email, identity.name.slice(0, 60) || email.split('@')[0], identity.avatarUrl.slice(0, 500), admin ? 'admin' : 'user'],
        );
        await tx.query('INSERT INTO profiles (account_id, handle) VALUES ($1, $2)', [id, await this.handleFor(tx, email)]);
      }
      await tx.query('INSERT INTO auth_identities (provider, subject, account_id) VALUES ($1, $2, $3)', [identity.provider, identity.subject, existing.id]);
      return existing;
    });
    if (account.status === 'suspended') throw new AuthError('이용이 정지된 계정이에요.');
    if (admin && account.role !== 'admin') {
      await this.db.query("UPDATE accounts SET role = 'admin' WHERE id = $1", [account.id]);
      account.role = 'admin';
    }
    return account;
  }

  // ── sessions ───────────────────────────────────────────────
  async createSession(accountId: string): Promise<string> {
    const token = newToken();
    const expires = new Date(this.now().getTime() + SESSION_DAYS * 86_400_000);
    await this.db.query('INSERT INTO sessions (id_hash, account_id, expires_at) VALUES ($1, $2, $3)', [sha256(token), accountId, expires]);
    return token;
  }

  async accountForSession(token: string | undefined): Promise<Account | null> {
    if (!token) return null;
    const [account] = await this.db.query<Account>(
      "SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.id_hash = $1 AND s.expires_at > $2 AND a.status = 'active'",
      [sha256(token), this.now()],
    );
    return account ?? null;
  }

  async endSession(token: string | undefined) {
    if (token) await this.db.query('DELETE FROM sessions WHERE id_hash = $1', [sha256(token)]);
  }

  sessionCookie(token: string) {
    return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}${this.secure ? '; Secure' : ''}`;
  }

  clearSessionCookie() {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${this.secure ? '; Secure' : ''}`;
  }

  // ── magic links ────────────────────────────────────────────
  /** Sends a sign-in link. Answers the same whether or not the address has an account. */
  async requestMagicLink(rawEmail: unknown, next: unknown, ip: string) {
    const email = String(rawEmail ?? '').trim().toLowerCase();
    if (!EMAIL.test(email)) throw new AuthError('메일 주소를 확인해 주세요.');
    const now = this.now().getTime();
    if (!this.perIp.allow(ip, now) || !this.perEmail.allow(email, now)) throw new AuthError('잠시 후 다시 시도해 주세요.');
    const token = newToken();
    await this.db.query('INSERT INTO magic_links (token_hash, email, next_path, expires_at) VALUES ($1, $2, $3, $4)', [
      sha256(token),
      email,
      safeNext(next),
      new Date(now + MAGIC_MINUTES * 60_000),
    ]);
    const link = `${this.config.publicUrl}/api/auth/email/verify?token=${token}`;
    await this.mailer.send({
      to: email,
      subject: 'AI 에이전트 오피스 로그인 링크',
      text: `아래 링크를 누르면 로그인돼요. ${MAGIC_MINUTES}분 동안 한 번만 쓸 수 있어요.\n\n${link}\n\n요청하지 않았다면 이 메일은 무시하세요.`,
    });
  }

  async verifyMagicLink(token: unknown): Promise<{ account: Account; next: string }> {
    const hash = sha256(String(token ?? ''));
    // Marks the link used in the same statement that checks it, so two clicks cannot both sign in.
    const [link] = await this.db.query<{ email: string; next_path: string }>(
      'UPDATE magic_links SET used_at = $2 WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2 RETURNING email, next_path',
      [hash, this.now()],
    );
    if (!link) throw new AuthError('링크가 만료됐거나 이미 쓰였어요. 다시 요청해 주세요.');
    const account = await this.signIn({ provider: 'email', subject: link.email, email: link.email, name: '', avatarUrl: '' });
    return { account, next: link.next_path };
  }

  // ── OAuth ──────────────────────────────────────────────────
  private sign(value: string) {
    return createHmac('sha256', this.config.secret).update(value).digest('base64url');
  }

  private redirectUri(provider: OAuthProvider) {
    return `${this.config.publicUrl}/api/auth/${provider}/callback`;
  }

  /** The provider's consent page, and a signed short-lived cookie holding state, PKCE verifier and where to go after. */
  oauthStart(provider: OAuthProvider, next: unknown): { url: string; cookie: string } {
    const client = this.config[provider];
    if (!client) throw new AuthError('이 로그인 방법은 아직 설정되지 않았어요.');
    const state = newToken();
    const verifier = newToken();
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const payload = Buffer.from(JSON.stringify({ provider, state, verifier, next: safeNext(next), exp: this.now().getTime() + OAUTH_MINUTES * 60_000 })).toString('base64url');
    const cookie = `${OAUTH_COOKIE}=${payload}.${this.sign(payload)}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=${OAUTH_MINUTES * 60}${this.secure ? '; Secure' : ''}`;
    const params = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: this.redirectUri(provider),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    if (provider === 'google') {
      params.set('response_type', 'code');
      params.set('scope', 'openid email profile');
      params.set('prompt', 'select_account');
      return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, cookie };
    }
    params.set('scope', 'read:user user:email');
    return { url: `https://github.com/login/oauth/authorize?${params}`, cookie };
  }

  clearOAuthCookie() {
    return `${OAUTH_COOKIE}=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0${this.secure ? '; Secure' : ''}`;
  }

  async oauthFinish(provider: OAuthProvider, query: Record<string, unknown>, cookies: Record<string, string>): Promise<{ account: Account; next: string }> {
    const client = this.config[provider];
    if (!client) throw new AuthError('이 로그인 방법은 아직 설정되지 않았어요.');
    const [payload = '', signature = ''] = (cookies[OAUTH_COOKIE] ?? '').split('.');
    const expected = this.sign(payload);
    if (!payload || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new AuthError('로그인 요청을 확인할 수 없어요. 처음부터 다시 시도해 주세요.');
    }
    const saved = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { provider: string; state: string; verifier: string; next: string; exp: number };
    if (saved.provider !== provider || saved.exp < this.now().getTime() || saved.state !== query.state) {
      throw new AuthError('로그인 요청이 만료됐거나 맞지 않아요. 처음부터 다시 시도해 주세요.');
    }
    if (typeof query.code !== 'string' || !query.code) throw new AuthError('로그인이 취소됐어요.');
    const identity = provider === 'google' ? await this.googleIdentity(query.code, saved.verifier, client) : await this.githubIdentity(query.code, saved.verifier, client);
    return { account: await this.signIn(identity), next: saved.next };
  }

  private async json(url: string, init: RequestInit) {
    const res = await this.fetchImpl(url, init);
    if (!res.ok) throw new AuthError(`로그인 서버가 응답하지 않아요 (${res.status}).`);
    return (await res.json()) as Record<string, unknown>;
  }

  private async googleIdentity(code: string, verifier: string, client: { clientId: string; clientSecret: string }): Promise<Identity> {
    const token = await this.json('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        redirect_uri: this.redirectUri('google'),
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
    });
    const user = await this.json('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${String(token.access_token)}` } });
    if (user.email_verified !== true || typeof user.email !== 'string') throw new AuthError('확인된 메일 주소가 있는 구글 계정만 쓸 수 있어요.');
    return { provider: 'google', subject: String(user.sub), email: user.email, name: String(user.name ?? ''), avatarUrl: String(user.picture ?? '') };
  }

  private async githubIdentity(code: string, verifier: string, client: { clientId: string; clientSecret: string }): Promise<Identity> {
    const token = await this.json('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: client.clientId, client_secret: client.clientSecret, redirect_uri: this.redirectUri('github'), code_verifier: verifier }),
    });
    if (typeof token.access_token !== 'string') throw new AuthError('GitHub 로그인이 거절됐어요.');
    const headers = { authorization: `Bearer ${token.access_token}`, accept: 'application/vnd.github+json', 'user-agent': 'avataragent-site' };
    const user = await this.json('https://api.github.com/user', { headers });
    const emails = (await (await this.fetchImpl('https://api.github.com/user/emails', { headers })).json()) as { email: string; primary: boolean; verified: boolean }[];
    const primary = Array.isArray(emails) ? emails.find((e) => e.primary && e.verified) : undefined;
    if (!primary) throw new AuthError('GitHub 계정에 확인된 기본 메일 주소가 있어야 해요.');
    return { provider: 'github', subject: String(user.id), email: primary.email, name: String(user.name ?? user.login ?? ''), avatarUrl: String(user.avatar_url ?? '') };
  }

  // ── middleware ─────────────────────────────────────────────
  /** Puts the signed-in account (or null) on `res.locals.account`. */
  attach() {
    return async (req: Request, res: Response, next: NextFunction) => {
      res.locals.account = await this.accountForSession(readCookies(req.headers.cookie)[SESSION_COOKIE]);
      next();
    };
  }

  /** Refuses cross-site writes: a request that changes something must come from the site's own pages. */
  sameOrigin() {
    const origin = new URL(this.config.publicUrl).origin;
    return (req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'GET' || req.method === 'HEAD') return next();
      const from = req.headers.origin;
      if (from && from !== origin) return void res.status(403).json({ error: '다른 사이트에서 온 요청은 받지 않아요.' });
      next();
    };
  }

  sessionToken(req: Request) {
    return readCookies(req.headers.cookie)[SESSION_COOKIE];
  }

  oauthCookies(req: Request) {
    return readCookies(req.headers.cookie);
  }
}
