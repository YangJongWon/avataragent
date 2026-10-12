export type Quote = 'JPY' | 'USD' | 'CNY';
export const QUOTES: Quote[] = ['JPY', 'USD', 'CNY'];
export const isQuote = (v: unknown): v is Quote => QUOTES.includes(v as Quote);

export interface ExchangeRate {
  base: 'KRW';
  quote: Quote;
  rate: number;
  date: string;
  source: string;
  fetchedAt: string;
}

const CACHE_MS = 6 * 60 * 60 * 1000;
const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const cache = new Map<Quote, { rate: ExchangeRate; at: number }>();
const pending = new Map<Quote, Promise<ExchangeRate>>();

/** EXCHANGE_RATE_API_URL may hold `{quote}`; without it the old KRW/JPY-only URL is read as JPY. */
function endpointFor(quote: Quote) {
  const custom = process.env.EXCHANGE_RATE_API_URL?.trim();
  if (custom) return custom.includes('{quote}') ? custom.replace('{quote}', quote) : quote === 'JPY' ? custom : null;
  return `https://api.frankfurter.dev/v2/rate/KRW/${quote}`;
}

async function fetchRate(quote: Quote): Promise<ExchangeRate> {
  const endpoint = endpointFor(quote);
  if (!endpoint) throw new Error(`${quote} 환율 주소가 설정되지 않았어요.`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(endpoint, { headers: { accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`환율 API 응답 오류 (${response.status})`);
    const data = (await response.json()) as { base?: string; quote?: string; rate?: number; date?: string };
    if (data.base !== 'KRW' || data.quote !== quote || !Number.isFinite(data.rate) || Number(data.rate) <= 0) {
      throw new Error(`환율 API가 올바른 KRW/${quote} 환율을 보내지 않았어요.`);
    }
    return { base: 'KRW', quote, rate: Number(data.rate), date: String(data.date ?? ''), source: new URL(endpoint).hostname, fetchedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timer);
  }
}

export async function krwRate(quote: Quote): Promise<ExchangeRate> {
  const now = Date.now();
  const hit = cache.get(quote);
  if (hit && now - hit.at < CACHE_MS) return hit.rate;
  let request = pending.get(quote);
  if (!request) {
    request = fetchRate(quote)
      .then((rate) => {
        cache.set(quote, { rate, at: Date.now() });
        return rate;
      })
      .finally(() => pending.delete(quote));
    pending.set(quote, request);
  }
  try {
    return await request;
  } catch (error) {
    if (hit && now - hit.at < STALE_MS) return hit.rate;
    throw error;
  }
}

export const krwJpyRate = () => krwRate('JPY');
