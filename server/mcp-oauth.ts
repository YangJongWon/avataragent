import { randomUUID } from 'node:crypto';
import { auth, type OAuthClientProvider, type OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { McpLoginInfo, McpServer } from '../shared/mcp.ts';
import { config } from './config.ts';
import { loadKv, saveKv } from './db.ts';

export const OAUTH_CALLBACK_PATH = '/api/mcp-oauth/callback';
const LOGIN_WINDOW_MS = 10 * 60_000;

interface OAuthRecord {
  redirectUrl: string;
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  tokensSavedAt?: number;
  verifier?: string;
  discovery?: OAuthDiscoveryState;
  /** Single-use value tying the login callback to this server. */
  state?: string;
  stateExpiresAt?: number;
}

// Tokens live in their own kv row so they never ride along with the state snapshot.
const records: Record<string, OAuthRecord> = loadKv<Record<string, OAuthRecord>>('mcp_oauth') ?? {};
const persist = () => saveKv('mcp_oauth', records);

const defaultRedirect = () => `${config.publicUrl || `http://localhost:${config.port}`}${OAUTH_CALLBACK_PATH}`;

function record(serverId: string): OAuthRecord {
  records[serverId] ??= { redirectUrl: defaultRedirect() };
  return records[serverId];
}

function patch(serverId: string, change: Partial<OAuthRecord>) {
  Object.assign(record(serverId), change);
  persist();
}

/** Keeps the OAuth client registration, tokens and PKCE verifier of one MCP server in kv. */
class KvOAuthProvider implements OAuthClientProvider {
  readonly serverId: string;
  /** Set when the SDK wants the user to sign in; the API hands it to the browser. */
  pendingUrl: URL | null = null;

  constructor(serverId: string) {
    this.serverId = serverId;
  }

  get redirectUrl() {
    return record(this.serverId).redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'AI 아바타 사무실',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  state() {
    const state = randomUUID();
    patch(this.serverId, { state, stateExpiresAt: Date.now() + LOGIN_WINDOW_MS });
    return state;
  }

  clientInformation() {
    return record(this.serverId).client;
  }

  saveClientInformation(client: OAuthClientInformationMixed) {
    patch(this.serverId, { client });
  }

  tokens() {
    return record(this.serverId).tokens;
  }

  saveTokens(tokens: OAuthTokens) {
    patch(this.serverId, { tokens, tokensSavedAt: Date.now() });
  }

  redirectToAuthorization(url: URL) {
    this.pendingUrl = url;
  }

  saveCodeVerifier(verifier: string) {
    patch(this.serverId, { verifier });
  }

  codeVerifier() {
    const verifier = record(this.serverId).verifier;
    if (!verifier) throw new Error('로그인을 처음부터 다시 해 주세요.');
    return verifier;
  }

  saveDiscoveryState(discovery: OAuthDiscoveryState) {
    patch(this.serverId, { discovery });
  }

  discoveryState() {
    return record(this.serverId).discovery;
  }

  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery') {
    const r = record(this.serverId);
    if (scope === 'all' || scope === 'client') delete r.client;
    if (scope === 'all' || scope === 'tokens') delete r.tokens;
    if (scope === 'all' || scope === 'verifier') delete r.verifier;
    if (scope === 'all' || scope === 'discovery') delete r.discovery;
    persist();
  }
}

/** Provider for background connections: refreshes tokens but never starts an interactive login. */
export const oauthProvider = (serverId: string): OAuthClientProvider => new KvOAuthProvider(serverId);

/**
 * Starts the login for `server`. Returns the URL the owner must open, or null when the saved
 * tokens are still usable. `origin` is the address the owner reached this app at.
 */
export async function startLogin(server: McpServer, origin: string): Promise<string | null> {
  const redirectUrl = `${config.publicUrl || origin}${OAUTH_CALLBACK_PATH}`;
  const { loggedIn, expiresAt } = loginInfo(server.id);
  if (loggedIn && (expiresAt === null || expiresAt > Date.now() + 60_000)) return null;
  const current = record(server.id);
  if (current.redirectUrl !== redirectUrl) {
    // A client registered for another callback address would be rejected by the login page.
    records[server.id] = { redirectUrl };
    persist();
  }
  const provider = new KvOAuthProvider(server.id);
  const result = await auth(provider, { serverUrl: server.url });
  if (result === 'AUTHORIZED') return null;
  if (!provider.pendingUrl) throw new Error('로그인 주소를 받지 못했어요.');
  return provider.pendingUrl.toString();
}

/** Finishes the login from the callback. Returns the server id the login belonged to. */
export async function finishLogin(state: string, code: string, serverOf: (id: string) => McpServer | undefined) {
  const serverId = Object.keys(records).find((id) => records[id].state === state);
  const r = serverId ? records[serverId] : undefined;
  if (!serverId || !r || (r.stateExpiresAt ?? 0) < Date.now()) throw new Error('로그인 요청이 만료됐어요. MCP 관리에서 다시 로그인해 주세요.');
  patch(serverId, { state: undefined, stateExpiresAt: undefined });
  const server = serverOf(serverId);
  if (!server) throw new Error('지워진 MCP 서버예요.');
  const result = await auth(new KvOAuthProvider(serverId), { serverUrl: server.url, authorizationCode: code });
  if (result !== 'AUTHORIZED') throw new Error('로그인을 마치지 못했어요.');
  patch(serverId, { verifier: undefined });
  return serverId;
}

export function logout(serverId: string) {
  delete records[serverId];
  persist();
}

export function loginInfo(serverId: string): McpLoginInfo {
  const r = records[serverId];
  const expiresIn = r?.tokens?.expires_in;
  return {
    loggedIn: Boolean(r?.tokens?.access_token),
    expiresAt: r?.tokensSavedAt && expiresIn ? r.tokensSavedAt + expiresIn * 1000 : null,
  };
}
