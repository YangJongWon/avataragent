import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { freeSubscription, GRACE_DAYS, PERIOD_DAYS, type BillingInfo, type BillingProviderId, type Checkout, type Subscription } from '../shared/billing.ts';
import { planOf, type Plan } from '../shared/plans.ts';
import { config } from './config.ts';
import { store } from './store.ts';

export type BillingEvent = { id: string } & (
  | { kind: 'checkout.completed'; checkoutId: string; customerId: string; subscriptionId: string; periodEnd: string }
  | { kind: 'checkout.failed' | 'checkout.canceled'; checkoutId: string }
  | { kind: 'payment.succeeded'; subscriptionId: string; amountKrw: number; periodEnd: string }
  | { kind: 'payment.failed' | 'subscription.canceled'; subscriptionId: string }
);

type Headers = Record<string, string | string[] | undefined>;

/**
 * What a real payment company (Toss Payments, Stripe, ...) has to implement to plug in.
 * Plan changes only ever happen through `applyBillingEvent`, so every provider shares the same rules.
 */
export interface BillingProvider {
  id: Exclude<BillingProviderId, 'none'>;
  label: string;
  /** Returns the page the owner is sent to for paying. */
  createCheckout(checkout: Checkout): Promise<{ url: string }>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  resumeSubscription(subscriptionId: string): Promise<void>;
  /** Verifies the signature and maps the payload to an event; throws on a bad signature, null for events we ignore. */
  parseWebhook(rawBody: string, headers: Headers): BillingEvent | null;
  /** Only for providers without renewal webhooks (the mock): the renewal event for a due subscription. */
  renewal?(subscription: Subscription, now: Date): BillingEvent | null;
}

const DAY_MS = 86_400_000;
const addDays = (from: Date, days: number) => new Date(from.getTime() + days * DAY_MS).toISOString();
const MAX_INVOICES = 60;
const MAX_CHECKOUTS = 20;
const MAX_PROCESSED = 200;

const mockSecret = () => config.billingWebhookSecret || createHmac('sha256', `${config.accessPassword}\0billing`).update('mock').digest('hex');
export const MOCK_SIGNATURE_HEADER = 'x-mock-signature';

export function signMock(rawBody: string) {
  return createHmac('sha256', mockSecret()).update(rawBody).digest('hex');
}

/** Runs the whole flow (checkout page, signed webhook, renewals) without a real payment company. */
export const mockProvider: BillingProvider = {
  id: 'mock',
  label: '모의 결제 (테스트용)',
  async createCheckout(checkout) {
    return { url: `/billing/mock-checkout/${checkout.id}` };
  },
  async cancelSubscription() {},
  async resumeSubscription() {},
  parseWebhook(rawBody, headers) {
    const given = String(headers[MOCK_SIGNATURE_HEADER] ?? '');
    const expected = signMock(rawBody);
    if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) throw new Error('결제 알림 서명이 맞지 않아요.');
    return JSON.parse(rawBody) as BillingEvent;
  },
  renewal(subscription, now) {
    if (subscription.status !== 'active' || subscription.cancelAtPeriodEnd || !subscription.subscriptionId || !subscription.currentPeriodEnd) return null;
    if (Date.parse(subscription.currentPeriodEnd) > now.getTime()) return null;
    return {
      id: `evt_${randomUUID().slice(0, 8)}`,
      kind: 'payment.succeeded',
      subscriptionId: subscription.subscriptionId,
      amountKrw: planOf(subscription.plan).priceKrw,
      periodEnd: addDays(new Date(subscription.currentPeriodEnd), PERIOD_DAYS),
    };
  },
};

const PROVIDERS: Record<BillingProvider['id'], BillingProvider> = { mock: mockProvider };

export const providerId = (): BillingProviderId => config.billingProvider;
export const billingProvider = (): BillingProvider | null => (providerId() === 'none' ? null : PROVIDERS[providerId() as BillingProvider['id']]);

export function billingInfo(): BillingInfo {
  const provider = billingProvider();
  return {
    provider: providerId(),
    providerLabel: provider?.label ?? '연결 안 됨',
    subscription: store.data.billing.subscription,
    invoices: store.data.billing.invoices,
  };
}

function setPlan(plan: Plan, reason: string) {
  if (store.data.plan === plan) return;
  store.mutate((s) => {
    s.plan = plan;
  });
  store.emit('plan.changed', { payload: { plan, reason } });
}

function updateBilling(fn: (billing: typeof store.data.billing) => void) {
  store.mutate((s) => {
    fn(s.billing);
    s.billing.invoices = s.billing.invoices.slice(0, MAX_INVOICES);
    s.billing.checkouts = s.billing.checkouts.slice(0, MAX_CHECKOUTS);
    s.billing.processedEvents = s.billing.processedEvents.slice(-MAX_PROCESSED);
  });
}

const invoice = (plan: Plan, amountKrw: number, status: 'paid' | 'failed') => ({
  id: `inv_${randomUUID().slice(0, 8)}`,
  plan,
  amountKrw,
  status,
  at: new Date().toISOString(),
  provider: providerId(),
});

export async function startCheckout(plan: Plan) {
  const provider = billingProvider();
  if (!provider) throw new Error('결제가 아직 연결되지 않았어요. 플랜을 바로 바꿀 수 있어요.');
  const meta = planOf(plan);
  if (meta.priceKrw === 0) throw new Error('무료 플랜으로는 구독 해지로 바꿔요.');
  const current = store.data.billing.subscription;
  if (current.plan === plan && current.status === 'active' && !current.cancelAtPeriodEnd) throw new Error('이미 이 플랜을 쓰고 있어요.');
  const checkout: Checkout = { id: `chk_${randomUUID().slice(0, 12)}`, plan, amountKrw: meta.priceKrw, status: 'open', createdAt: new Date().toISOString() };
  updateBilling((b) => {
    b.checkouts.unshift(checkout);
  });
  store.emit('billing.checkout_started', { payload: { plan, amountKrw: checkout.amountKrw } });
  return provider.createCheckout(checkout);
}

/** Cancels at the end of the paid period; the plan keeps working until then. */
export async function cancelSubscription() {
  const provider = billingProvider();
  const sub = store.data.billing.subscription;
  if (!provider || sub.status !== 'active' || !sub.subscriptionId) throw new Error('해지할 구독이 없어요.');
  await provider.cancelSubscription(sub.subscriptionId);
  updateBilling((b) => {
    b.subscription.cancelAtPeriodEnd = true;
  });
  store.emit('billing.cancel_scheduled', { payload: { plan: sub.plan, until: sub.currentPeriodEnd } });
}

export async function resumeSubscription() {
  const provider = billingProvider();
  const sub = store.data.billing.subscription;
  if (!provider || sub.status !== 'active' || !sub.cancelAtPeriodEnd || !sub.subscriptionId) throw new Error('되살릴 구독이 없어요.');
  await provider.resumeSubscription(sub.subscriptionId);
  updateBilling((b) => {
    b.subscription.cancelAtPeriodEnd = false;
  });
  store.emit('billing.resumed', { payload: { plan: sub.plan } });
}

/** The only place plans change while billing is connected. Repeated deliveries of one event are ignored. */
export async function applyBillingEvent(event: BillingEvent) {
  const billing = store.data.billing;
  if (billing.processedEvents.includes(event.id)) return;
  updateBilling((b) => {
    b.processedEvents.push(event.id);
  });
  const sub = billing.subscription;
  const sameSubscription = 'subscriptionId' in event && event.subscriptionId === sub.subscriptionId;

  switch (event.kind) {
    case 'checkout.completed': {
      const checkout = billing.checkouts.find((c) => c.id === event.checkoutId);
      if (!checkout || checkout.status !== 'open') return;
      const previous = sub.subscriptionId && sub.subscriptionId !== event.subscriptionId ? sub.subscriptionId : null;
      updateBilling((b) => {
        b.checkouts.find((c) => c.id === checkout.id)!.status = 'completed';
        b.subscription = {
          plan: checkout.plan,
          status: 'active',
          provider: providerId(),
          customerId: event.customerId,
          subscriptionId: event.subscriptionId,
          currentPeriodEnd: event.periodEnd,
          cancelAtPeriodEnd: false,
        };
        b.invoices.unshift(invoice(checkout.plan, checkout.amountKrw, 'paid'));
      });
      if (previous) await billingProvider()?.cancelSubscription(previous);
      setPlan(checkout.plan, '결제 완료');
      store.emit('billing.subscribed', { payload: { plan: checkout.plan, amountKrw: checkout.amountKrw } });
      return;
    }
    case 'checkout.failed':
    case 'checkout.canceled':
      updateBilling((b) => {
        const checkout = b.checkouts.find((c) => c.id === event.checkoutId);
        if (checkout?.status === 'open') checkout.status = event.kind === 'checkout.failed' ? 'failed' : 'canceled';
      });
      store.emit(event.kind === 'checkout.failed' ? 'billing.payment_failed' : 'billing.checkout_canceled', { payload: {} });
      return;
    case 'payment.succeeded':
      if (!sameSubscription) return;
      updateBilling((b) => {
        b.subscription.status = 'active';
        b.subscription.currentPeriodEnd = event.periodEnd;
        b.invoices.unshift(invoice(b.subscription.plan, event.amountKrw, 'paid'));
      });
      setPlan(sub.plan, '정기 결제');
      store.emit('billing.renewed', { payload: { plan: sub.plan, amountKrw: event.amountKrw, until: event.periodEnd } });
      return;
    case 'payment.failed':
      if (!sameSubscription) return;
      updateBilling((b) => {
        b.subscription.status = 'past_due';
        b.invoices.unshift(invoice(b.subscription.plan, planOf(b.subscription.plan).priceKrw, 'failed'));
      });
      store.emit('billing.payment_failed', { payload: { plan: sub.plan, graceDays: GRACE_DAYS } });
      return;
    case 'subscription.canceled':
      if (!sameSubscription) return;
      updateBilling((b) => {
        b.subscription = { ...freeSubscription(providerId()), status: 'canceled' };
      });
      setPlan('personal', '구독 종료');
      return;
  }
}

export async function handleWebhook(providerParam: string, rawBody: string, headers: Headers) {
  const provider = billingProvider();
  if (!provider || provider.id !== providerParam) throw new Error('연결되지 않은 결제사예요.');
  const event = provider.parseWebhook(rawBody, headers);
  if (event) await applyBillingEvent(event);
}

/** Renewals for providers without webhooks, cancellations at period end, and the end of the grace period. */
export async function billingTick(now = new Date()) {
  const provider = billingProvider();
  if (!provider) return;
  const sub = store.data.billing.subscription;
  const renewal = provider.renewal?.(sub, now);
  if (renewal) return applyBillingEvent(renewal);
  const end = sub.currentPeriodEnd ? Date.parse(sub.currentPeriodEnd) : null;
  if (end === null) return;
  const lapsed = (sub.status === 'active' && sub.cancelAtPeriodEnd && end <= now.getTime()) || (sub.status === 'past_due' && end + GRACE_DAYS * DAY_MS <= now.getTime());
  if (!lapsed) return;
  updateBilling((b) => {
    b.subscription = { ...freeSubscription(providerId()), status: 'canceled' };
  });
  setPlan('personal', sub.status === 'past_due' ? '결제 실패 유예 기간 종료' : '구독 기간 종료');
}

/** Mock checkout page outcome, delivered through the same signed webhook path a real provider would use. */
export async function completeMockCheckout(checkoutId: string, outcome: 'pay' | 'fail' | 'cancel') {
  const checkout = store.data.billing.checkouts.find((c) => c.id === checkoutId);
  if (!checkout || checkout.status !== 'open') throw new Error('끝났거나 없는 결제예요.');
  const id = `evt_${randomUUID().slice(0, 8)}`;
  const event: BillingEvent =
    outcome === 'pay'
      ? {
          id,
          kind: 'checkout.completed',
          checkoutId,
          customerId: store.data.billing.subscription.customerId ?? `cus_${randomUUID().slice(0, 8)}`,
          subscriptionId: `sub_${randomUUID().slice(0, 8)}`,
          periodEnd: addDays(new Date(), PERIOD_DAYS),
        }
      : { id, kind: outcome === 'fail' ? 'checkout.failed' : 'checkout.canceled', checkoutId };
  const raw = JSON.stringify(event);
  await handleWebhook('mock', raw, { [MOCK_SIGNATURE_HEADER]: signMock(raw) });
}
