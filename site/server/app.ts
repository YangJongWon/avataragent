import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { PLANS } from '../../shared/plans.ts';
import { Auth, AuthError, type Account, type OAuthProvider } from './auth.ts';
import { BillingError, licenseKey, SiteBilling } from './billing.ts';
import { Community, CommunityError } from './community.ts';
import { Creators } from './creators.ts';
import { CATEGORIES, Forum } from './forum.ts';
import { audit, Moderation } from './moderation.ts';
import type { SiteConfig } from './config.ts';
import type { Db } from './db.ts';
import type { Mailer } from './mail.ts';
import { mockOutcome, mockPayments, PaymentError, type PaymentProvider } from './payments.ts';
import { Sales } from './sales.ts';
import { diskStorage, filesDir, type FileStorage } from './storage.ts';

const ROOT = resolve(import.meta.dirname, '..', '..');

/** Documents the site renders, by slug; only these files can be read through the API. */
export const DOCS: Record<string, { file: string; title: string }> = {
  'theme-guide': { file: 'docs/THEME_GUIDE.md', title: '테마 만들기' },
  operations: { file: 'OPERATIONS.md', title: '운영 가이드' },
  licensing: { file: 'LICENSING.md', title: '라이선스' },
  contributing: { file: 'CONTRIBUTING.md', title: '기여 안내' },
};

export interface SiteDeps {
  db: Db;
  config: SiteConfig;
  mailer: Mailer;
  fetch?: typeof fetch;
  now?: () => Date;
  payments?: PaymentProvider;
  storage?: FileStorage;
}

class SignInRequired extends Error {}

function signedIn(res: Response): Account {
  const account = res.locals.account as Account | null;
  if (!account) throw new SignInRequired('로그인이 필요해요.');
  return account;
}

const publicAccount = (a: Account | null, handle: string | null) => a && { id: a.id, email: a.email, name: a.name, avatarUrl: a.avatar_url, role: a.role, handle };

export function createSiteApp(deps: SiteDeps) {
  const auth = new Auth(deps.db, deps.config, deps.mailer, deps.fetch, deps.now);
  const payments = deps.payments ?? mockPayments;
  const billing = new SiteBilling(deps.db, payments, licenseKey(deps.config.license, deps.config.dataDir), deps.config.publicUrl, deps.now);
  const community = new Community(deps.db, deps.storage ?? diskStorage(filesDir(deps.config.dataDir)), deps.now);
  const sales = new Sales(deps.db, payments, deps.config.publicUrl, deps.now);
  const creators = new Creators(deps.db, community, deps.now);
  const forum = new Forum(deps.db, deps.now);
  const moderation = new Moderation(deps.db, forum, deps.now);
  const app = express();
  app.set('trust proxy', true);

  // Before the JSON parser: signatures are checked against the body exactly as the payment company sent it.
  app.post('/api/payments/webhook/:provider', express.text({ type: '*/*', limit: '256kb' }), async (req, res) => {
    if (req.params.provider !== payments.id) throw new BillingError('연결되지 않은 결제사예요.', 404);
    const event = payments.parseWebhook(typeof req.body === 'string' ? req.body : '', req.headers);
    if (event) await billing.handle(event);
    res.json({ ok: true });
  });

  app.use(express.json({ limit: '256kb' }));
  app.use(auth.sameOrigin());
  app.use(auth.attach());

  // ── sign-in ────────────────────────────────────────────────
  app.post('/api/auth/email', async (req, res) => {
    await auth.requestMagicLink(req.body?.email, req.body?.next, req.ip ?? 'unknown');
    res.status(204).end();
  });

  app.get('/api/auth/email/verify', async (req, res) => {
    const { account, next } = await auth.verifyMagicLink(req.query.token);
    res.setHeader('set-cookie', auth.sessionCookie(await auth.createSession(account.id)));
    res.redirect(next);
  });

  for (const provider of ['google', 'github'] as OAuthProvider[]) {
    app.get(`/api/auth/${provider}`, (req, res) => {
      const { url, cookie } = auth.oauthStart(provider, req.query.next);
      res.setHeader('set-cookie', cookie);
      res.redirect(url);
    });
    app.get(`/api/auth/${provider}/callback`, async (req, res) => {
      const { account, next } = await auth.oauthFinish(provider, req.query as Record<string, unknown>, auth.oauthCookies(req));
      res.setHeader('set-cookie', [auth.clearOAuthCookie(), auth.sessionCookie(await auth.createSession(account.id))]);
      res.redirect(next);
    });
  }

  app.post('/api/auth/logout', async (req, res) => {
    await auth.endSession(auth.sessionToken(req));
    res.setHeader('set-cookie', auth.clearSessionCookie());
    res.status(204).end();
  });

  app.get('/api/me', async (_req, res) => {
    const account = res.locals.account as Account | null;
    res.json({ account: publicAccount(account, account ? await creators.handleOf(account.id) : null), providers: auth.providers() });
  });

  // ── public content ─────────────────────────────────────────
  app.get('/api/plans', (_req, res) => {
    res.json(PLANS);
  });

  app.get('/api/docs', (_req, res) => {
    res.json(Object.entries(DOCS).map(([slug, d]) => ({ slug, title: d.title })));
  });

  app.get('/api/docs/:slug', (req, res) => {
    const doc = DOCS[req.params.slug];
    if (!doc) return void res.status(404).json({ error: '없는 문서예요.' });
    res.json({ title: doc.title, markdown: readFileSync(join(ROOT, doc.file), 'utf8') });
  });

  // ── plan sales ─────────────────────────────────────────────
  app.post('/api/checkout', async (req, res) => {
    const account = signedIn(res);
    res.json(await billing.startPlanCheckout(account.id, { plan: req.body?.plan, install: req.body?.install, ref: req.body?.ref, returnUrl: req.body?.returnUrl }));
  });

  app.get('/api/checkout/:id', async (req, res) => {
    res.json(await billing.checkout(signedIn(res).id, req.params.id));
  });

  // The mock provider's test page: pay or fail. Only the buyer can press it.
  app.post('/api/payments/mock/:id', async (req, res) => {
    const account = signedIn(res);
    if (payments.id !== 'mock') throw new BillingError('모의 결제가 켜져 있지 않아요.', 404);
    await billing.checkout(account.id, req.params.id);
    const result = await billing.handle(mockOutcome(req.params.id, req.body?.result === 'paid'));
    res.json(result);
  });

  app.get('/api/payments/config', (_req, res) => {
    res.json(payments.browser ?? { provider: payments.id });
  });

  app.get('/api/licenses', async (_req, res) => {
    res.json(await billing.licenses(signedIn(res).id));
  });

  app.post('/api/licenses/:id/transfer', async (req, res) => {
    res.json(await billing.transfer(signedIn(res).id, req.params.id, req.body?.install));
  });

  app.post('/api/subscriptions/:id/:action', async (req, res) => {
    const action = req.params.action;
    if (action !== 'cancel' && action !== 'resume') throw new BillingError('없는 동작이에요.', 404);
    await billing.setCancel(signedIn(res).id, req.params.id, action === 'cancel');
    res.json(await billing.licenses(signedIn(res).id));
  });

  // Installs call this (no cookie, no browser) for a fresh license near the end of each period.
  app.post('/v1/licenses/refresh', async (req, res) => {
    res.json(await billing.refresh(req.body?.token, req.body?.install));
  });

  // So a private or local site can be trusted by installs (LICENSE_PUBLIC_KEYS).
  app.get('/v1/licenses/public-key', (_req, res) => {
    res.json(billing.publicKey);
  });

  // ── community ──────────────────────────────────────────────
  app.get('/api/items', async (req, res) => {
    res.json(await community.list(req.query));
  });

  app.get('/api/me/items', async (_req, res) => {
    res.json(await community.mine(signedIn(res)));
  });

  // The file goes as the raw body; what it is and its tags go in the query.
  app.post('/api/items', express.raw({ type: () => true, limit: '21mb' }), async (req, res) => {
    const body = req.body as unknown;
    const bytes = Buffer.isBuffer(body) ? new Uint8Array(body) : new TextEncoder().encode(JSON.stringify(body ?? null));
    res.json(await community.upload(signedIn(res), { type: req.query.type, bytes, item: req.query.item, tags: req.query.tags, license: req.query.license }));
  });

  app.get('/api/items/:id', async (req, res) => {
    res.json(await community.detail(req.params.id, res.locals.account));
  });

  app.get('/api/items/:id/preview', async (req, res) => {
    const file = await community.preview(req.params.id);
    if (!file) return void res.status(404).end();
    res.setHeader('content-type', file.contentType);
    res.setHeader('cache-control', 'public, max-age=300');
    res.end(Buffer.from(file.bytes));
  });

  // Public: installs fetch free items here through their own server.
  app.get('/api/items/:id/download', async (req, res) => {
    const file = await community.download(req.params.id, res.locals.account, req.query.v);
    res.setHeader('content-type', file.contentType);
    res.setHeader('content-disposition', `attachment; filename="${file.name}"`);
    res.setHeader('x-item-type', file.type);
    res.end(Buffer.from(file.bytes));
  });

  app.post('/api/items/:id/like', async (req, res) => {
    res.json(await community.like(req.params.id, signedIn(res), req.body?.on !== false));
  });

  app.post('/api/items/:id/report', async (req, res) => {
    res.json(await community.report(req.params.id, signedIn(res), req.body?.reason));
  });

  app.post('/api/items/:id/status', async (req, res) => {
    const account = signedIn(res);
    const result = await community.setStatus(req.params.id, account, req.body?.status);
    if (account.role === 'admin') await audit(deps.db, account, `item.${String(req.body?.status)}`, req.params.id);
    res.json(result);
  });

  app.post('/api/items/:id/verified', async (req, res) => {
    const account = signedIn(res);
    const result = await community.setVerified(req.params.id, account, req.body?.verified === true);
    await audit(deps.db, account, req.body?.verified === true ? 'item.verify' : 'item.unverify', req.params.id);
    res.json(result);
  });

  // ── paid themes ────────────────────────────────────────────
  app.post('/api/items/:id/price', async (req, res) => {
    res.json(await sales.setPrice(signedIn(res), req.params.id, req.body?.priceKrw));
  });

  app.post('/api/items/:id/checkout', async (req, res) => {
    res.json(await sales.startCheckout(signedIn(res), req.params.id));
  });

  app.get('/api/me/purchases', async (_req, res) => {
    res.json(await sales.purchases(signedIn(res)));
  });

  app.get('/api/me/earnings', async (_req, res) => {
    res.json(await sales.earnings(signedIn(res)));
  });

  app.get('/api/admin/balances', async (_req, res) => {
    res.json(await sales.balances(signedIn(res)));
  });

  app.get('/api/admin/sales', async (_req, res) => {
    res.json(await sales.sales(signedIn(res)));
  });

  app.post('/api/admin/purchases/:id/refund', async (req, res) => {
    res.json(await sales.refund(signedIn(res), req.params.id, req.body?.reason));
  });

  app.post('/api/admin/payouts', async (req, res) => {
    res.json(await sales.payout(signedIn(res), String(req.body?.creatorId ?? ''), req.body?.amountKrw, req.body?.note));
  });

  // ── creators ───────────────────────────────────────────────
  app.get('/api/ranking', async (req, res) => {
    res.json(await creators.ranking(req.query.period));
  });

  app.get('/api/users/:handle', async (req, res) => {
    res.json(await creators.profile(req.params.handle, res.locals.account));
  });

  app.put('/api/me/profile', async (req, res) => {
    res.json(await creators.update(signedIn(res), req.body ?? {}));
  });

  // ── forum ──────────────────────────────────────────────────
  app.get('/api/forum/categories', (_req, res) => {
    res.json(CATEGORIES);
  });

  app.get('/api/posts', async (req, res) => {
    res.json(await forum.list(req.query));
  });

  app.post('/api/posts', async (req, res) => {
    res.json(await forum.create(signedIn(res), req.body ?? {}));
  });

  app.get('/api/posts/:id', async (req, res) => {
    res.json(await forum.get(req.params.id, res.locals.account));
  });

  app.put('/api/posts/:id', async (req, res) => {
    res.json(await forum.edit(signedIn(res), req.params.id, req.body ?? {}));
  });

  app.delete('/api/posts/:id', async (req, res) => {
    res.json(await forum.remove(signedIn(res), req.params.id));
  });

  app.post('/api/posts/:id/comments', async (req, res) => {
    res.json(await forum.comment(signedIn(res), req.params.id, req.body?.body));
  });

  app.post('/api/posts/:id/accept', async (req, res) => {
    res.json(await forum.accept(signedIn(res), req.params.id, req.body?.commentId ?? null));
  });

  app.post('/api/posts/:id/pin', async (req, res) => {
    const account = signedIn(res);
    const result = await forum.pin(account, req.params.id, req.body?.pinned === true);
    await audit(deps.db, account, req.body?.pinned === true ? 'post.pin' : 'post.unpin', req.params.id);
    res.json(result);
  });

  app.put('/api/comments/:id', async (req, res) => {
    res.json(await forum.editComment(signedIn(res), req.params.id, req.body?.body));
  });

  app.delete('/api/comments/:id', async (req, res) => {
    res.json(await forum.removeComment(signedIn(res), req.params.id));
  });

  app.post('/api/reports', async (req, res) => {
    res.json(await forum.report(signedIn(res), req.body?.type, String(req.body?.id ?? ''), req.body?.reason));
  });

  // ── admin ──────────────────────────────────────────────────
  app.get('/api/admin/queue', async (_req, res) => {
    res.json(await moderation.queue(signedIn(res)));
  });

  app.post('/api/admin/resolve', async (req, res) => {
    res.json(await moderation.resolve(signedIn(res), req.body?.type, String(req.body?.id ?? ''), req.body?.action));
  });

  app.get('/api/admin/users', async (req, res) => {
    res.json(await moderation.users(signedIn(res), req.query.q));
  });

  app.post('/api/admin/users/:id/suspend', async (req, res) => {
    res.json(await moderation.suspend(signedIn(res), req.params.id, req.body?.on !== false, req.body?.reason));
  });

  app.get('/api/admin/log', async (_req, res) => {
    res.json(await moderation.log(signedIn(res)));
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: '없는 주소예요.' });
  });

  // ── pages ──────────────────────────────────────────────────
  const dist = join(ROOT, 'dist', 'site');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/*path', (_req, res) => res.sendFile(join(dist, 'index.html')));
  }

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof SignInRequired) return void res.status(401).json({ error: message });
    if (error instanceof BillingError || error instanceof CommunityError) return void res.status(error.status).json({ error: message });
    if (error instanceof PaymentError) return void res.status(400).json({ error: message });
    if ((error as { type?: string }).type === 'entity.too.large') return void res.status(413).json({ error: '파일이 너무 커요.' });
    const known = error instanceof AuthError;
    if (!known) console.error(error);
    // Sign-in links and OAuth callbacks are opened in the browser: send people back to the login page with the reason.
    if (req.method === 'GET' && req.path.startsWith('/api/auth/')) {
      return void res.redirect(`/login?error=${encodeURIComponent(known ? message : '로그인 중 문제가 생겼어요.')}`);
    }
    res.status(known ? 400 : 500).json({ error: known ? message : '서버에서 문제가 생겼어요.' });
  });

  return Object.assign(app, { billing, community, creators, forum, moderation, sales });
}
