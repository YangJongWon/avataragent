import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import type { ShareLink, Viewer } from '../shared/types.ts';
import { config } from './config.ts';
import { checkPassword, findByLogin, memberFromToken, memberToken, touchLogin, usable, type StoredMember } from './members.ts';
import { store } from './store.ts';

const OWNER_COOKIE = 'office_session';
const SHARE_COOKIE = 'office_share';
const MEMBER_COOKIE = 'office_member';
const MAX_AGE_SEC = 30 * 24 * 60 * 60;
const FAIL_DELAY_MS = 1000;

export const authEnabled = () => config.accessPassword !== '';

// Changing ACCESS_PASSWORD invalidates every existing session.
const sessionToken = () => createHmac('sha256', config.accessPassword).update('avataragent-session').digest('hex');

const digest = (value: string) => createHash('sha256').update(value).digest();

function sameSecret(a: string, b: string) {
  return timingSafeEqual(digest(a), digest(b));
}

function readCookie(header: string | undefined, name: string) {
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

const isExpired = (share: ShareLink) => share.expiresAt !== null && Date.parse(share.expiresAt) <= Date.now();

function findShare(token: string) {
  if (!token) return null;
  const share = store.data.shares.find((s) => sameSecret(s.token, token));
  return share && !isExpired(share) ? share : null;
}

const shareViewer = (share: ShareLink): Viewer => ({
  kind: 'share',
  shareId: share.id,
  name: share.name,
  role: share.role,
  officeIds: share.officeIds,
});

const memberViewer = (member: StoredMember): Viewer => ({
  kind: 'member',
  memberId: member.id,
  name: member.name,
  role: member.role,
  officeIds: member.officeIds,
});

/** Member accounts need ACCESS_PASSWORD: without it everyone is the owner and the signing key would be empty. */
function memberOf(req: IncomingMessage) {
  if (!authEnabled()) return null;
  const token = readCookie(req.headers.cookie, MEMBER_COOKIE);
  return token ? memberFromToken(token) : null;
}

/** A share cookie wins over the other sessions so the owner can preview a link; /logout clears them all. */
export function viewerOf(req: IncomingMessage): Viewer | null {
  const share = findShare(readCookie(req.headers.cookie, SHARE_COOKIE));
  if (share) return shareViewer(share);
  const member = memberOf(req);
  if (member) return memberViewer(member);
  if (!authEnabled()) return { kind: 'owner' };
  const token = readCookie(req.headers.cookie, OWNER_COOKIE);
  return token !== '' && sameSecret(token, sessionToken()) ? { kind: 'owner' } : null;
}

/** Re-checks a viewer captured earlier (e.g. by a long-lived WebSocket); a changed role or scope also ends it. */
export function stillValid(viewer: Viewer) {
  if (viewer.kind === 'owner') return true;
  if (viewer.kind === 'member') {
    const member = store.data.members.find((m) => m.id === viewer.memberId);
    return Boolean(member && usable(member) && member.role === viewer.role && JSON.stringify(member.officeIds) === JSON.stringify(viewer.officeIds));
  }
  const share = store.data.shares.find((s) => s.id === viewer.shareId);
  return Boolean(share && !isExpired(share));
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function loginPage(error = '') {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AvatarCast Office · 로그인</title>
<style>
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: #2b2438; font-family: system-ui, sans-serif; }
  form { background: #fff8ec; border: 3px solid #3a3045; box-shadow: 6px 6px 0 #1a1522; padding: 28px 24px; width: min(320px, 86vw); }
  h1 { margin: 0 0 16px; font-size: 18px; color: #3a3045; }
  input { width: 100%; box-sizing: border-box; font-size: 20px; padding: 10px; border: 2px solid #3a3045; letter-spacing: 2px; margin-bottom: 8px; }
  .hint { color: #6b5f73; font-size: 12px; margin: 10px 0 0; }
  button { margin-top: 14px; width: 100%; font-size: 16px; padding: 10px; background: #f4c542; border: 2px solid #3a3045; box-shadow: 3px 3px 0 #3a3045; cursor: pointer; }
  .error { color: #c0392b; font-size: 14px; margin: 10px 0 0; }
</style>
</head>
<body>
<form method="post" action="/login">
  <h1>🏢 AvatarCast Office</h1>
  <input type="text" name="loginId" id="loginId" autocomplete="username" autocapitalize="none" placeholder="아이디 (구성원만)" />
  <input type="password" name="password" id="password" inputmode="numeric" autocomplete="current-password" placeholder="비밀번호" autofocus required />
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
  <button type="submit">들어가기</button>
  <p class="hint">회사 소유자는 비밀번호만, 구성원은 아이디와 비밀번호를 넣어요.</p>
</form>
<script>
  const id = document.getElementById('loginId');
  const pw = document.getElementById('password');
  id.addEventListener('input', () => { if (id.value) pw.removeAttribute('inputmode'); else pw.setAttribute('inputmode', 'numeric'); });
</script>
</body>
</html>`;
}

function cookieHeader(req: Request, name: string, value: string, maxAge: number) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function authRouter(): Router {
  const router = express.Router();

  router.get('/login', (req, res) => {
    if (viewerOf(req)) return res.redirect('/');
    res.type('html').send(loginPage());
  });

  router.post('/login', express.urlencoded({ extended: false }), async (req, res) => {
    if (!authEnabled()) return res.redirect('/');
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const loginId = typeof req.body?.loginId === 'string' ? req.body.loginId.trim() : '';
    const fail = async (message: string) => {
      await new Promise((resolve) => setTimeout(resolve, FAIL_DELAY_MS));
      res.status(401).type('html').send(loginPage(message));
    };
    if (loginId) {
      const member = findByLogin(loginId);
      if (!member || !checkPassword(password, member.passwordHash)) return fail('아이디나 비밀번호가 맞지 않아요.');
      if (!usable(member)) return fail('지금은 이 계정으로 들어올 수 없어요. 회사 소유자에게 문의해 주세요.');
      touchLogin(member.id);
      res.setHeader('Set-Cookie', [
        cookieHeader(req, MEMBER_COOKIE, memberToken(member), MAX_AGE_SEC),
        cookieHeader(req, OWNER_COOKIE, '', 0),
        cookieHeader(req, SHARE_COOKIE, '', 0),
      ]);
      return res.redirect('/');
    }
    if (!sameSecret(password, config.accessPassword)) return fail('비밀번호가 맞지 않아요.');
    res.setHeader('Set-Cookie', [
      cookieHeader(req, OWNER_COOKIE, sessionToken(), MAX_AGE_SEC),
      cookieHeader(req, SHARE_COOKIE, '', 0),
      cookieHeader(req, MEMBER_COOKIE, '', 0),
    ]);
    res.redirect('/');
  });

  router.get('/s/:token', async (req, res) => {
    const share = findShare(req.params.token);
    if (!share) {
      await new Promise((resolve) => setTimeout(resolve, FAIL_DELAY_MS));
      return res.status(404).type('html').send(loginPage('공유 링크가 만료되었거나 취소되었어요. 공유한 사람에게 새 링크를 받아 주세요.'));
    }
    const untilExpiry = share.expiresAt ? Math.floor((Date.parse(share.expiresAt) - Date.now()) / 1000) : MAX_AGE_SEC;
    store.mutate((s) => {
      const target = s.shares.find((x) => x.id === share.id);
      if (target) target.lastUsedAt = new Date().toISOString();
    });
    res.setHeader('Set-Cookie', cookieHeader(req, SHARE_COOKIE, share.token, Math.max(60, Math.min(untilExpiry, MAX_AGE_SEC))));
    res.redirect('/');
  });

  router.get('/logout', (req, res) => {
    res.setHeader('Set-Cookie', [cookieHeader(req, OWNER_COOKIE, '', 0), cookieHeader(req, SHARE_COOKIE, '', 0), cookieHeader(req, MEMBER_COOKIE, '', 0)]);
    res.redirect('/login');
  });

  router.use((req: Request, res: Response, next: NextFunction) => {
    const viewer = viewerOf(req);
    if (viewer) {
      res.locals.viewer = viewer;
      return next();
    }
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: '로그인이 필요해요.' });
    res.redirect('/login');
  });

  return router;
}
