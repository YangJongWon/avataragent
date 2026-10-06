import { randomUUID } from 'node:crypto';
import type { BillingInterval, Plan } from '../../shared/plans.ts';

/**
 * The payment company behind the site, for plans (subscriptions) and later paid themes (one-off). Same shape as
 * the app's BillingProvider: a checkout page, verified events, cancel and resume. Toss Payments or Paddle plug in
 * here; until one is chosen the mock runs the whole flow on the site's own test page.
 */

export type PaymentEvent = { id: string } & (
  | { kind: 'checkout.paid'; checkoutId: string; providerRef: string }
  | { kind: 'checkout.failed'; checkoutId: string }
  | { kind: 'renewal.paid'; providerRef: string; amountKrw: number }
  | { kind: 'renewal.failed'; providerRef: string }
  | { kind: 'subscription.canceled'; providerRef: string }
);

/** A provider refused a request or a notification (bad signature, missing setting). Answered as 400. */
export class PaymentError extends Error {}

export interface CheckoutRequest {
  id: string;
  kind: 'plan' | 'item';
  plan?: Plan;
  /** Plans only: billed monthly unless 'year'. */
  interval?: BillingInterval;
  amountKrw: number;
  title: string;
}

export interface PaymentProvider {
  id: string;
  label: string;
  /** Renewals are charged by the site's own clock (the mock) rather than reported by the provider. */
  selfRenewing: boolean;
  createCheckout(checkout: CheckoutRequest, publicUrl: string): Promise<{ url: string }>;
  /** Verifies and maps a provider notification; throws on a bad signature, null for events the site ignores. */
  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): PaymentEvent | null;
  cancel(providerRef: string): Promise<void>;
  resume(providerRef: string): Promise<void>;
  /** Gives a one-off payment back (paid themes). */
  refund?(providerRef: string, amountKrw: number): Promise<void>;
  /** What the checkout page in the browser needs (Paddle.js token); nothing secret. */
  browser?: { provider: string; env: string; token: string };
}

export const mockPayments: PaymentProvider = {
  id: 'mock',
  label: '모의 결제 (테스트용)',
  selfRenewing: true,
  async createCheckout(checkout, publicUrl) {
    return { url: `${publicUrl}/checkout/mock/${checkout.id}` };
  },
  parseWebhook() {
    throw new Error('모의 결제는 웹훅을 쓰지 않아요.');
  },
  async cancel() {},
  async resume() {},
  async refund() {},
};

/** The test page's buttons, as the events a real provider would send. */
export function mockOutcome(checkoutId: string, paid: boolean): PaymentEvent {
  const id = `mock_${randomUUID().slice(0, 12)}`;
  return paid ? { id, kind: 'checkout.paid', checkoutId, providerRef: `mocksub_${randomUUID().slice(0, 12)}` } : { id, kind: 'checkout.failed', checkoutId };
}
