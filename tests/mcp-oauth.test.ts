import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { McpServer as SdkServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod';
import type { McpServer } from '../shared/mcp.ts';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-oauth-'));
process.env.PUBLIC_URL = 'http://office.local:8787';

const ACCESS_TOKEN = 'access-token-5678';
const challenges = new Map<string, string>();
let base = '';

const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString();
};

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
};

/** Minimal OAuth 2.1 authorization server (dynamic registration + PKCE) in front of an MCP endpoint. */
const http = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', base);
  if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
    return json(res, 200, { resource: `${base}/mcp`, authorization_servers: [base] });
  }
  if (url.pathname === '/.well-known/oauth-authorization-server') {
    return json(res, 200, {
      issuer: base,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      registration_endpoint: `${base}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    });
  }
  if (url.pathname === '/register' && req.method === 'POST') {
    const metadata = JSON.parse(await readBody(req));
    return json(res, 201, { ...metadata, client_id: 'client-1', client_id_issued_at: Math.floor(Date.now() / 1000) });
  }
  if (url.pathname === '/token' && req.method === 'POST') {
    const form = new URLSearchParams(await readBody(req));
    const challenge = challenges.get(form.get('code') ?? '');
    const verifier = form.get('code_verifier') ?? '';
    if (form.get('grant_type') !== 'authorization_code' || !challenge || createHash('sha256').update(verifier).digest('base64url') !== challenge) {
      return json(res, 400, { error: 'invalid_grant' });
    }
    return json(res, 200, { access_token: ACCESS_TOKEN, token_type: 'Bearer', expires_in: 3600, refresh_token: 'refresh-1' });
  }
  if (url.pathname === '/mcp') {
    if (req.headers.authorization !== `Bearer ${ACCESS_TOKEN}`) {
      res.writeHead(401, { 'www-authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"` }).end();
      return;
    }
    const server = new SdkServer({ name: 'fake-oauth', version: '1.0.0' });
    server.registerTool('whoami', { description: '로그인 확인', inputSchema: { q: z.string() }, annotations: { readOnlyHint: true } }, async () => ({
      content: [{ type: 'text', text: 'ok' }],
    }));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    const body = req.method === 'POST' ? JSON.parse(await readBody(req)) : undefined;
    return transport.handleRequest(req, res, body);
  }
  res.writeHead(404).end();
});
await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;

const { closeAllConnections, discoverTools } = await import('../server/mcp.ts');
const { finishLogin, loginInfo, logout, startLogin } = await import('../server/mcp-oauth.ts');
const { loadKv } = await import('../server/db.ts');

after(() => {
  closeAllConnections();
  http.close();
});

const server: McpServer = {
  id: 'mcp_oauth',
  name: 'OAuth 테스트',
  icon: '🔐',
  transport: 'http',
  url: `${base}/mcp`,
  command: '',
  args: [],
  enabled: true,
  officeIds: 'all',
  tools: [],
  checkedAt: null,
  lastError: null,
  oauth: true,
};

test('OAuth MCP 서버에 로그인하고 토큰으로 도구를 부른다', async () => {
  await assert.rejects(discoverTools(server), /로그인이 필요해요/, '로그인 전에는 연결하지 못한다');
  closeAllConnections();

  const url = new URL((await startLogin(server, 'http://ignored-when-public-url-is-set'))!);
  assert.equal(url.origin + url.pathname, `${base}/authorize`);
  assert.equal(url.searchParams.get('client_id'), 'client-1', '동적 등록한 클라이언트로 로그인한다');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://office.local:8787/api/mcp-oauth/callback');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const state = url.searchParams.get('state')!;
  assert.ok(state);
  challenges.set('code-1', url.searchParams.get('code_challenge')!);

  await assert.rejects(finishLogin('wrong-state', 'code-1', () => server), /만료/, '모르는 state는 거절한다');
  assert.equal(await finishLogin(state, 'code-1', () => server), server.id);
  await assert.rejects(finishLogin(state, 'code-1', () => server), /만료/, 'state는 한 번만 쓴다');

  const info = loginInfo(server.id);
  assert.equal(info.loggedIn, true);
  assert.ok(info.expiresAt && info.expiresAt > Date.now());

  const tools = await discoverTools(server);
  assert.deepEqual(
    tools.map((t) => t.name),
    ['whoami'],
  );
  assert.equal(await startLogin(server, 'http://office.local:8787'), null, '토큰이 있으면 다시 로그인하지 않는다');

  const saved = JSON.stringify(loadKv('mcp_oauth'));
  assert.ok(saved.includes(ACCESS_TOKEN), '토큰은 별도 kv 행에 저장된다');

  logout(server.id);
  assert.equal(loginInfo(server.id).loggedIn, false);
});
