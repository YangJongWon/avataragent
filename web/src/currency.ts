import type { Language } from '../../shared/i18n.ts';

/**
 * How money is shown to this viewer. Amounts are kept in KRW everywhere; display converts with the
 * latest rate. The choice is personal (this browser), so people in one company may see different currencies.
 */

export type Currency = 'KRW' | 'JPY' | 'USD' | 'CNY';
export type CurrencyChoice = Currency | 'auto';

export const CURRENCIES: { id: Currency; label: string; locale: string; digits: number }[] = [
  { id: 'KRW', label: '₩ 원 (KRW)', locale: 'ko-KR', digits: 0 },
  { id: 'JPY', label: '¥ 円 (JPY)', locale: 'ja-JP', digits: 0 },
  { id: 'USD', label: '$ Dollar (USD)', locale: 'en-US', digits: 2 },
  { id: 'CNY', label: '¥ 元 (CNY)', locale: 'zh-CN', digits: 2 },
];

const BY_LANGUAGE: Record<Language, Currency> = { ko: 'KRW', ja: 'JPY', en: 'USD', zh: 'CNY' };
const KEY = 'displayCurrency';

export function savedCurrency(): CurrencyChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'auto' || CURRENCIES.some((c) => c.id === value) ? (value as CurrencyChoice) : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveCurrency(choice: CurrencyChoice) {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // 저장을 막은 브라우저면 이번 방문에만 쓴다.
  }
}

export const currencyFor = (choice: CurrencyChoice, language: Language): Currency => (choice === 'auto' ? BY_LANGUAGE[language] : choice);

let display: { code: Currency; rate: number } = { code: 'KRW', rate: 1 };

/** Sets the currency to show; a missing rate keeps showing KRW so no amount is ever wrong. */
export function setDisplayCurrency(code: Currency, rate: number | null) {
  display = code === 'KRW' || !rate || !Number.isFinite(rate) || rate <= 0 ? { code: 'KRW', rate: 1 } : { code, rate };
}

export const displayCurrency = () => display.code;

/** Formats a KRW amount in the viewer's currency. */
export function formatMoney(krw: number) {
  const meta = CURRENCIES.find((c) => c.id === display.code)!;
  const value = krw * display.rate;
  const abs = Math.abs(value);
  // Small amounts (cheap AI calls) keep a couple of decimals so they don't all read as zero.
  const digits = abs > 0 && abs < (meta.digits ? 1 : 100) ? Math.max(meta.digits, 2) : meta.digits;
  return new Intl.NumberFormat(meta.locale, { style: 'currency', currency: meta.id, minimumFractionDigits: 0, maximumFractionDigits: digits }).format(value);
}
