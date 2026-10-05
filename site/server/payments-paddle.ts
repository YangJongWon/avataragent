import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Plan } from '../../shared/plans.ts';
import { PaymentError, type CheckoutRequest, type PaymentEvent, type PaymentProvider } from './payments.ts';

/**
 * Paddle Billing (merchant of record): Paddle sells to the customer, handles tax and invoices, and pays the site.
 *
 * - Plans use prices made in the Paddle dashboard (one per plan); paid themes use a one-off price made per checkout.
 * - A checkout is a Paddle transaction. Paddle opens it on the site's /checkout/paddle page (set it as the
 *   "default payment link" in Paddle), and the site learns the result from webhooks, never from the browser.
 * - Paddle charges renewals itself and reports them; cancel, resume and refund go through its API.
 */

export interface PaddleConfig {
  env: 'sandbox' | 'live';
  apiKey: string;
  /** For Paddle.js in the browser; safe to show. */
  clientToken: string;
  webhookSecret: string;
  prices: Partial<Record<Plan, string>>;
  /** Currency for one-off theme prices. Paddle takes KRW in whole won. */
  currency: string;
}

/** How old a signed webhook may be; Paddle retries with a fresh signature. */
const SIGNATURE_TOLERANCE_S = 300;

const API = { sandbox: 'https://sandbox-api.paddle.com', live: 'https://api.paddle.com' };

/** Checks `Paddle-Signature: ts=…;h1=…` (several h1 while a secret is rotated): HMAC-SHA256 of `ts:body`. */
export function verifyPaddleSignature(rawBody: string, header: string | undefined, secret: string, nowMs = Date.now()) {
  const parts = (header ?? '').split(';').map((p) => p.split('='));
  const ts = parts.find(([k]) => k === 'ts')?.[1];
  const signatures = parts.filter(([k]) => k === 'h1').map(([, v]) => v);
  if (!ts || !signatures.length || !/^\d+$/.test(ts)) throw new PaymentError('Paddle 서명이 없어요.');
  if (Math.abs(nowMs / 1000 - Number(ts)) > SIGNATURE_TOLERANCE_S) throw new PaymentError('Paddle 서명이 너무 오래됐어요.');
  const expected = createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest();
  const ok = signatures.some((s) => /^[0-9a-f]{64}$/.test(s) && timingSafeEqual(Buffer.from(s, 'hex'), expected));
  if (!ok) throw new PaymentError('Paddle 서명이 맞지 않아요.');
}

interface PaddleTransaction {
  id: string;
  origin?: string;
  subscription_id?: string | null;
  custom_data?: { checkout_id?: string } | null;
  currency_code?: string;
  details?: { totals?: { grand_total?: string } };
  items?: { quantity?: number }[];
}

/** Maps a verified Paddle notification to the site's payment events; null for ones the site does not use. */
export function paddleEvent(body: { event_id?: string; event_type?: string; data?: Record<string, unknown> }): PaymentEvent | null {
  const id = String(body.event_id ?? '');
  if (!id) throw new PaymentError('Paddle 알림에 event_id가 없어요.');
  const data = (body.data ?? {}) as Record<string, unknown>;
  switch (body.event_type) {
    case 'transaction.completed': {
      const txn = data as unknown as PaddleTransaction;
      if (txn.origin === 'subscription_recurring') {
        if (!txn.subscription_id) return null;
        const total = Number(txn.details?.totals?.grand_total ?? 0);
        // The ledger is in won; renewals in other currencies are recorded without an amount.
        return { id, kind: 'renewal.paid', providerRef: txn.subscription_id, amountKrw: txn.currency_code === 'KRW' ? total : 0 };
      }
      const checkoutId = txn.custom_data?.checkout_id;
      if (!checkoutId) return null;
      // A license or a theme is one copy. Still honor the payment (refusing would make Paddle retry forever and leave
      // the buyer with nothing), but flag it so an admin refunds the extra in Paddle.
      if ((txn.items ?? []).some((i) => (i.quantity ?? 1) !== 1)) console.warn(`[paddle] ${txn.id}: quantity is not 1; refund the extra in Paddle`);
      return { id, kind: 'checkout.paid', checkoutId, providerRef: txn.subscription_id ?? txn.id };
    }
    case 'transaction.payment_failed': {
      // A failed card during checkout can be retried in the same window, so only failed renewals count.
      const txn = data as unknown as PaddleTransaction;
      return txn.origin === 'subscription_recurring' && txn.subscription_id ? { id, kind: 'renewal.failed', providerRef: txn.subscription_id } : null;
    }
    case 'subscription.past_due':
      return { id, kind: 'renewal.failed', providerRef: String(data.id) };
    case 'subscription.canceled':
      return { id, kind: 'subscription.canceled', providerRef: String(data.id) };
    default:
      return null;
  }
}

export function paddlePayments(config: PaddleConfig, fetchImpl: typeof fetch = (...args) => fetch(...args), now: () => number = () => Date.now()): PaymentProvider {
  const base = API[config.env];
  async function call(method: string, path: string, body?: unknown) {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown>; error?: { detail?: string; code?: string } };
    if (!res.ok) throw new PaymentError(`Paddle 요청이 실패했어요 (${res.status}${json.error?.code ? ` ${json.error.code}` : ''}): ${json.error?.detail ?? ''}`.trim());
    return json.data ?? {};
  }

  return {
    id: 'paddle',
    label: 'Paddle',
    selfRenewing: false,
    async createCheckout(checkout: CheckoutRequest) {
      let item: Record<string, unknown>;
      if (checkout.kind === 'plan') {
        const priceId = checkout.plan && config.prices[checkout.plan];
        if (!priceId) throw new PaymentError(`Paddle에 ${checkout.plan} 플랜 가격이 설정되지 않았어요 (PADDLE_PRICE_${String(checkout.plan).toUpperCase()}).`);
        item = { price_id: priceId, quantity: 1 };
      } else {
        item = {
          quantity: 1,
          price: {
            description: checkout.title.slice(0, 200),
            name: checkout.title.slice(0, 150),
            unit_price: { amount: String(checkout.amountKrw), currency_code: config.currency },
            // One copy per purchase: the checkout window must not offer a quantity.
            quantity: { minimum: 1, maximum: 1 },
            product: { name: checkout.title.slice(0, 150), tax_category: 'standard' },
          },
        };
      }
      const txn = await call('POST', '/transactions', { items: [item], custom_data: { checkout_id: checkout.id } });
      const url = (txn.checkout as { url?: string } | undefined)?.url;
      if (!url) throw new PaymentError('Paddle에 기본 결제 링크(default payment link)를 설정해 주세요: <사이트 주소>/checkout/paddle');
      const page = new URL(url);
      page.searchParams.set('chk', checkout.id);
      return { url: page.toString() };
    },
    parseWebhook(rawBody, headers) {
      const header = headers['paddle-signature'];
      verifyPaddleSignature(rawBody, Array.isArray(header) ? header[0] : header, config.webhookSecret, now());
      let body: unknown;
      try {
        body = JSON.parse(rawBody);
      } catch {
        throw new PaymentError('Paddle 알림을 읽을 수 없어요.');
      }
      return paddleEvent(body as Parameters<typeof paddleEvent>[0]);
    },
    async cancel(providerRef) {
      await call('POST', `/subscriptions/${encodeURIComponent(providerRef)}/cancel`, { effective_from: 'next_billing_period' });
    },
    async resume(providerRef) {
      // Undoing a cancel that is scheduled for the period end.
      await call('PATCH', `/subscriptions/${encodeURIComponent(providerRef)}`, { scheduled_change: null });
    },
    async refund(providerRef) {
      await call('POST', '/adjustments', { action: 'refund', type: 'full', transaction_id: providerRef, reason: '사이트 운영자 환불' });
    },
    browser: { provider: 'paddle', env: config.env, token: config.clientToken },
  };
}

export function paddleConfigFromEnv(env: (name: string, fallback?: string) => string): PaddleConfig | null {
  if (!env('PADDLE_API_KEY')) return null;
  return {
    env: env('PADDLE_ENV', 'sandbox') === 'live' ? 'live' : 'sandbox',
    apiKey: env('PADDLE_API_KEY'),
    clientToken: env('PADDLE_CLIENT_TOKEN'),
    webhookSecret: env('PADDLE_WEBHOOK_SECRET'),
    prices: { team: env('PADDLE_PRICE_TEAM') || undefined, business: env('PADDLE_PRICE_BUSINESS') || undefined },
    currency: env('PADDLE_CURRENCY', 'KRW'),
  };
}
