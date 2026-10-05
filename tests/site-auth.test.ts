import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

const { createSiteApp } = await import('../site/server/app.ts');
const { migrate, openDb } = await import('../site/server/db.ts');
const { safeNext } = await import('../site/server/auth.ts');

type Config = Parameters<typeof createSiteApp>[0]['config'];

/** A site on a random port with an in-memory database, a mail outbox and scripted OAuth providers. */
async function startSite(overrides: Partial<Config> = {}, fakeFetch?: typeof fetch) {
  const db = await openDb();
  await migrate(db);
  const outbox: { to: string; text: string }[] = [];
  let now = new Date('2026-10-05T00:00:00Z');
  const config: Config = {
    port: 0,
    publicUrl: 'http://site.test',
    databaseUrl: '',
    dataDir: '',
    secret: 'test-secret',
    adminEmails: ['boss@example.com'],
    google: { clientId: 'g-id', clientSecret: 'g-secret' },
    github: { clientId: 'h-id', clientSecret: 'h-secret' },
    mail: { provider: 'console' },
    ...overrides,
  };
  const app = createSiteApp({ db, config, mailer: { send: async (m) => void outbox.push(m) }, fetch: fakeFetch, now: () => now });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let cookies: Record<string, string> = {};
  const call = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(base + path, {
      redirect: 'manual',
      ...init,
      headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '), ...(init.headers ?? {}) },
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const [name, value] = pair.split('=');
      if (value) cookies[name] = value;
      else delete cookies[name];
    }
    return res;
  };
  const post = (path: string, body: unknown, origin = 'http://site.test') =>
    call(path, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) });
  return {
    call,
    post,
    outbox,
    db,
    me: async () => (await (await call('/api/me')).json()).account,
    advance: (ms: number) => (now = new Date(now.getTime() + ms)),
    resetCookies: () => (cookies = {}),
    close: async () => {
      server.close();
      await db.close();
    },
  };
}

const linkPath = (text: string) => new URL(text.match(/https?:\/\/\S+/)![0]).pathname + new URL(text.match(/https?:\/\/\S+/)![0]).search;

test('an email link signs in once, creates the account and its profile', async () => {
  const site = await startSite();
  assert.equal((await site.post('/api/auth/email', { email: 'Mina@Example.com', next: '/account' })).status, 204);
  assert.equal(site.outbox.length, 1);
  const path = linkPath(site.outbox[0].text);

  const res = await site.call(path);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/account');
  const me = await site.me();
  assert.equal(me.email, 'mina@example.com');
  assert.equal(me.role, 'user');
  assert.deepEqual(await site.db.query('SELECT handle FROM profiles'), [{ handle: 'mina' }]);

  site.resetCookies();
  const again = await site.call(path);
  assert.match(decodeURIComponent(again.headers.get('location') ?? ''), /이미 쓰였어요/);
  assert.equal(await site.me(), null);
  await site.close();
});

test('links expire, addresses are checked and requests are rate limited', async () => {
  const site = await startSite();
  assert.equal((await site.post('/api/auth/email', { email: 'not-an-email' })).status, 400);
  await site.post('/api/auth/email', { email: 'late@example.com' });
  site.advance(16 * 60_000);
  assert.match(decodeURIComponent((await site.call(linkPath(site.outbox[0].text))).headers.get('location') ?? ''), /만료/);
  for (let i = 0; i < 4; i++) await site.post('/api/auth/email', { email: 'late@example.com' });
  assert.equal((await site.post('/api/auth/email', { email: 'late@example.com' })).status, 400, 'sixth link in an hour is refused');
  await site.close();
});

test('writes from other sites are refused and sign-in only redirects within the site', async () => {
  const site = await startSite();
  assert.equal((await site.post('/api/auth/email', { email: 'x@example.com' }, 'https://evil.example')).status, 403);
  for (const bad of ['https://evil.example', '//evil.example', '/\\evil', 'javascript:alert(1)', 42]) assert.equal(safeNext(bad), '/');
  assert.equal(safeNext('/gallery?tab=themes'), '/gallery?tab=themes');
  await site.close();
});

test('admins come from the configured list and logout ends the session', async () => {
  const site = await startSite();
  await site.post('/api/auth/email', { email: 'boss@example.com' });
  await site.call(linkPath(site.outbox[0].text));
  assert.equal((await site.me()).role, 'admin');
  assert.equal((await site.post('/api/auth/logout', {})).status, 204);
  assert.equal(await site.me(), null);
  await site.close();
});

/** Plays Google and GitHub: token exchange and user info, recording what the site sent. */
function fakeProviders(user: { email: string; verified?: boolean }) {
  const seen: { url: string; body: string }[] = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, body: init?.body ? String(init.body) : '' });
    const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    if (url.includes('oauth2.googleapis.com/token') || url.includes('github.com/login/oauth/access_token')) return json({ access_token: 'at' });
    if (url.includes('openidconnect.googleapis.com')) return json({ sub: 'g-123', email: user.email, email_verified: user.verified ?? true, name: 'Mina G', picture: 'https://img/g.png' });
    if (url.endsWith('api.github.com/user')) return json({ id: 777, login: 'mina-gh', name: null, avatar_url: 'https://img/h.png' });
    if (url.endsWith('api.github.com/user/emails')) return json([{ email: user.email, primary: true, verified: user.verified ?? true }]);
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fakeFetch, seen };
}

async function oauthRound(site: Awaited<ReturnType<typeof startSite>>, provider: 'google' | 'github', tamper?: (state: string) => string) {
  const start = await site.call(`/api/auth/${provider}?next=/gallery`);
  const consent = new URL(start.headers.get('location')!);
  const state = consent.searchParams.get('state')!;
  assert.equal(consent.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(consent.searchParams.get('redirect_uri'), `http://site.test/api/auth/${provider}/callback`);
  return site.call(`/api/auth/${provider}/callback?code=c0de&state=${tamper ? tamper(state) : state}`);
}

test('Google and GitHub sign in to the same account as the verified email', async () => {
  const { fakeFetch, seen } = fakeProviders({ email: 'mina@example.com' });
  const site = await startSite({}, fakeFetch);
  await site.post('/api/auth/email', { email: 'mina@example.com' });
  await site.call(linkPath(site.outbox[0].text));
  const first = await site.me();
  site.resetCookies();

  const google = await oauthRound(site, 'google');
  assert.equal(google.headers.get('location'), '/gallery');
  assert.equal((await site.me()).id, first.id, 'linked by email');
  assert.ok(seen.some((s) => s.url.includes('oauth2.googleapis.com/token') && s.body.includes('code_verifier=')), 'PKCE verifier is sent');
  site.resetCookies();

  await oauthRound(site, 'github');
  assert.equal((await site.me()).id, first.id);
  assert.deepEqual((await site.db.query<{ provider: string }>('SELECT provider FROM auth_identities ORDER BY provider')).map((r) => r.provider), ['email', 'github', 'google']);
  await site.close();
});

test('OAuth refuses a wrong state, an unverified email and an unconfigured provider', async () => {
  const site = await startSite({}, fakeProviders({ email: 'x@example.com', verified: false }).fakeFetch);
  const forged = await oauthRound(site, 'google', () => 'forged');
  assert.match(decodeURIComponent(forged.headers.get('location') ?? ''), /맞지 않아요/);
  const unverified = await oauthRound(site, 'google');
  assert.match(decodeURIComponent(unverified.headers.get('location') ?? ''), /확인된 메일/);
  assert.equal(await site.me(), null);
  await site.close();

  const bare = await startSite({ google: null });
  const res = await bare.call('/api/auth/google');
  assert.match(decodeURIComponent(res.headers.get('location') ?? ''), /설정되지 않았어요/);
  assert.deepEqual((await (await bare.call('/api/me')).json()).providers, { email: true, google: false, github: true });
  await bare.close();
});

test('plans and whitelisted docs are public', async () => {
  const site = await startSite();
  const plans = await (await site.call('/api/plans')).json();
  assert.deepEqual(plans.map((p: { id: string }) => p.id), ['personal', 'team', 'business']);
  const doc = await (await site.call('/api/docs/theme-guide')).json();
  assert.match(doc.markdown, /테마 만들기 가이드/);
  assert.equal((await site.call('/api/docs/..%2F.env')).status, 404);
  await site.close();
});
