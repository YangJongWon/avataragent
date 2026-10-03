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
