import type { Company, KeySource } from '../shared/models.ts';
import { config } from './config.ts';
import { loadKv, saveKv } from './db.ts';

// API keys live in their own kv row so they never ride along with the state snapshot.
const saved: Record<string, string> = loadKv<Record<string, string>>('secrets') ?? {};

const envKey = (company: Company) => (company.api === 'openai_compatible' ? '' : config.keys[company.api]);

export function setApiKey(companyId: string, key: string | null) {
  if (key) saved[companyId] = key;
  else delete saved[companyId];
  saveKv('secrets', saved);
}

export function apiKeyFor(company: Company) {
  return saved[company.id] || envKey(company);
}

export function keyInfo(company: Company): { source: KeySource; hint: string } {
  const key = apiKeyFor(company);
  const source: KeySource = saved[company.id] ? 'saved' : key ? 'env' : 'none';
  return { source, hint: key ? `••••${key.slice(-4)}` : '' };
}

// MCP server secrets: env vars for stdio servers, headers for HTTP servers.
const mcpSaved: Record<string, Record<string, string>> = loadKv<Record<string, Record<string, string>>>('mcp_secrets') ?? {};

/** `null` removes a secret; other values replace it. */
export function setMcpSecrets(serverId: string, patch: Record<string, string | null>) {
  const current = { ...mcpSaved[serverId] };
  for (const [name, value] of Object.entries(patch)) {
    if (value) current[name] = value;
    else delete current[name];
  }
  if (Object.keys(current).length) mcpSaved[serverId] = current;
  else delete mcpSaved[serverId];
  saveKv('mcp_secrets', mcpSaved);
}

export function dropMcpSecrets(serverId: string) {
  delete mcpSaved[serverId];
  saveKv('mcp_secrets', mcpSaved);
}

export const mcpSecretsFor = (serverId: string): Record<string, string> => ({ ...mcpSaved[serverId] });

export const mcpSecretInfo = (serverId: string) =>
  Object.entries(mcpSaved[serverId] ?? {}).map(([name, value]) => ({ name, hint: `••••${value.slice(-4)}` }));
