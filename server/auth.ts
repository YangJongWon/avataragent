import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import type { ShareLink, Viewer } from '../shared/types.ts';
import { config } from './config.ts';
import { store } from './store.ts';

const OWNER_COOKIE = 'office_session';
const SHARE_COOKIE = 'office_share';
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

/** A share cookie wins over the owner session so the owner can preview a link; /logout clears both. */
export function viewerOf(req: IncomingMessage): Viewer | null {
  const share = findShare(readCookie(req.headers.cookie, SHARE_COOKIE));
  if (share) return shareViewer(share);
  if (!authEnabled()) return { kind: 'owner' };
  const token = readCookie(req.headers.cookie, OWNER_COOKIE);
  return token !== '' && sameSecret(token, sessionToken()) ? { kind: 'owner' } : null;
}

/** Re-checks a viewer captured earlier (e.g. by a long-lived WebSocket). */
export function stillValid(viewer: Viewer) {
  if (viewer.kind === 'owner') return true;
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
<title>AI 에이전트 오피스 · 로그인</title>
<style>
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: #2b2438; font-family: system-ui, sans-serif; }
  form { background: #fff8ec; border: 3px solid #3a3045; box-shadow: 6px 6px 0 #1a1522; padding: 28px 24px; width: min(320px, 86vw); }
  h1 { margin: 0 0 16px; font-size: 18px; color: #3a3045; }
  input { width: 100%; box-sizing: border-box; font-size: 20px; padding: 10px; border: 2px solid #3a3045; letter-spacing: 4px; }
  button { margin-top: 14px; width: 100%; font-size: 16px; padding: 10px; background: #f4c542; border: 2px solid #3a3045; box-shadow: 3px 3px 0 #3a3045; cursor: pointer; }
  .error { color: #c0392b; font-size: 14px; margin: 10px 0 0; }
</style>
</head>
<body>
<form method="post" action="/login">
  <h1>🏢 AI 에이전트 오피스</h1>
  <input type="password" name="password" inputmode="numeric" autocomplete="current-password" placeholder="비밀번호" autofocus required />
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
  <button type="submit">들어가기</button>
</form>
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
    if (!sameSecret(password, config.accessPassword)) {
      await new Promise((resolve) => setTimeout(resolve, FAIL_DELAY_MS));
      return res.status(401).type('html').send(loginPage('비밀번호가 맞지 않아요.'));
    }
    res.setHeader('Set-Cookie', [cookieHeader(req, OWNER_COOKIE, sessionToken(), MAX_AGE_SEC), cookieHeader(req, SHARE_COOKIE, '', 0)]);
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
    res.setHeader('Set-Cookie', [cookieHeader(req, OWNER_COOKIE, '', 0), cookieHeader(req, SHARE_COOKIE, '', 0)]);
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
