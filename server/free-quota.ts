import type { FreeQuota } from '../shared/types.ts';
import { loadKv, saveKv } from './db.ts';

/**
 * OpenRouter's free models allow 50 requests a UTC day per account, 1,000 once $10 of credits were bought.
 * The real count comes from OpenRouter's key endpoint; between checks the office adds its own requests on top.
 */
const FREE_DAILY = 50;
const KEY_URL = 'https://openrouter.ai/api/v1/key';
/** OpenRouter adds requests to its count seconds to minutes after answering, so it is asked a few times after the last one. */
const SETTLE_MS = [30_000, 90_000, 300_000];
const POLL_MS = 10 * 60 * 1000;

interface Saved {
  day: string;
  used: number;
  limit: number;
  /** When OpenRouter last reported the count; null while it is the office's own estimate. */
  checkedAt: string | null;
}

const today = (now = new Date()) => now.toISOString().slice(0, 10);
const state: Saved = { day: today(), used: 0, limit: FREE_DAILY, checkedAt: null, ...loadKv<Saved>('openrouter_free_quota') };
const listeners = new Set<() => void>();
let keyOf: () => string = () => '';
let fetcher: typeof fetch = (...args) => fetch(...args);
let settle: ReturnType<typeof setTimeout>[] = [];

function rollOver() {
  const day = today();
  if (state.day === day) return;
  Object.assign(state, { day, used: 0, checkedAt: null });
}

function changed() {
  saveKv('openrouter_free_quota', state);
  for (const listener of listeners) listener();
}

export function freeQuota(): FreeQuota {
  rollOver();
  const reset = new Date(`${state.day}T00:00:00Z`);
  reset.setUTCDate(reset.getUTCDate() + 1);
  return { used: Math.min(state.used, state.limit), limit: state.limit, resetsAt: reset.toISOString(), checkedAt: state.checkedAt };
}

export const onFreeQuotaChange = (listener: () => void) => listeners.add(listener);

/** Asks OpenRouter how many free requests the account has used today. */
export async function syncFreeQuota() {
  const key = keyOf();
  if (!key) return;
  try {
    const res = await fetcher(KEY_URL, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return;
    const data = (await res.json())?.data;
    const daily = data?.free_model_daily_requests;
    rollOver();
    if (Number.isFinite(daily?.used) && Number.isFinite(daily?.limit) && daily.limit > 0) {
      // A day's count only grows; OpenRouter's lagging answer must not take back requests already counted here.
      Object.assign(state, { used: Math.max(state.used, daily.used), limit: daily.limit, checkedAt: new Date().toISOString() });
    } else if (typeof data?.is_free_tier === 'boolean') {
      // An older answer without the counter still tells the allowance.
      state.limit = data.is_free_tier ? FREE_DAILY : 1000;
    } else return;
    changed();
  } catch {
    // Offline or a changed API: keep the last count.
  }
}

function syncSoon() {
  for (const timer of settle) clearTimeout(timer);
  settle = SETTLE_MS.map((ms) => setTimeout(() => void syncFreeQuota(), ms));
  for (const timer of settle) timer.unref?.();
}

/** One request went to a free model: counted at once, then checked with OpenRouter. */
export function noteFreeRequest() {
  rollOver();
  state.used++;
  changed();
  syncSoon();
}

/** OpenRouter said today's allowance is gone, whatever the count says. */
export function noteFreeExhausted() {
  rollOver();
  state.used = state.limit;
  changed();
}

/** Starts checking with OpenRouter now and every few minutes; `key` reads the saved OpenRouter key. */
export function startFreeQuotaSync(key: () => string, fetchImpl?: typeof fetch) {
  keyOf = key;
  if (fetchImpl) fetcher = fetchImpl;
  void syncFreeQuota();
  setInterval(() => void syncFreeQuota(), POLL_MS).unref();
}
