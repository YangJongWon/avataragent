import type { Plan } from './plans.ts';

/** 'none' means billing is not connected: the owner switches plans directly. */
export type BillingProviderId = 'none' | 'mock';

export type SubscriptionStatus = 'none' | 'active' | 'past_due' | 'canceled';

export interface Subscription {
  plan: Plan;
  status: SubscriptionStatus;
  provider: BillingProviderId;
  customerId: string | null;
  subscriptionId: string | null;
  currentPeriodEnd: string | null;
  /** The plan drops to personal when the period ends instead of renewing. */
  cancelAtPeriodEnd: boolean;
}

export interface Invoice {
  id: string;
  plan: Plan;
  amountKrw: number;
  status: 'paid' | 'failed';
  at: string;
  provider: BillingProviderId;
}

export interface Checkout {
  id: string;
  plan: Plan;
  amountKrw: number;
  status: 'open' | 'completed' | 'failed' | 'canceled';
  createdAt: string;
}

/** Owner-only billing view in the snapshot. */
export interface BillingInfo {
  provider: BillingProviderId;
  providerLabel: string;
  subscription: Subscription;
  invoices: Invoice[];
}

export const PERIOD_DAYS = 30;
/** After a failed payment the paid plan stays this long before dropping to personal. */
export const GRACE_DAYS = 7;

export const freeSubscription = (provider: BillingProviderId): Subscription => ({
  plan: 'personal',
  status: 'none',
  provider,
  customerId: null,
  subscriptionId: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
});
