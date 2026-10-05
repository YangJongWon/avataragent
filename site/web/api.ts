import type { PlanMeta } from '../../shared/plans.ts';

export interface Me {
  account: { id: string; email: string; name: string; avatarUrl: string; role: 'user' | 'admin' } | null;
  providers: { email: boolean; google: boolean; github: boolean };
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `요청 실패 (${res.status})`);
  return data as T;
}

export const siteApi = {
  me: () => call<Me>('GET', '/api/me'),
  sendLink: (email: string, next: string) => call<void>('POST', '/api/auth/email', { email, next }),
  logout: () => call<void>('POST', '/api/auth/logout', {}),
  plans: () => call<PlanMeta[]>('GET', '/api/plans'),
  docs: () => call<{ slug: string; title: string }[]>('GET', '/api/docs'),
  doc: (slug: string) => call<{ title: string; markdown: string }>('GET', `/api/docs/${encodeURIComponent(slug)}`),
  startCheckout: (input: { plan: string; install: string; ref?: string; returnUrl?: string }) => call<{ url: string }>('POST', '/api/checkout', input),
  checkout: (id: string) => call<CheckoutView>('GET', `/api/checkout/${encodeURIComponent(id)}`),
  mockPay: (id: string, paid: boolean) => call<{ redirect: string | null }>('POST', `/api/payments/mock/${encodeURIComponent(id)}`, { result: paid ? 'paid' : 'failed' }),
  licenses: () => call<LicenseView[]>('GET', '/api/licenses'),
  transfer: (id: string, install: string) => call<{ token: string }>('POST', `/api/licenses/${encodeURIComponent(id)}/transfer`, { install }),
  setCancel: (subscriptionId: string, cancel: boolean) => call<LicenseView[]>('POST', `/api/subscriptions/${encodeURIComponent(subscriptionId)}/${cancel ? 'cancel' : 'resume'}`, {}),
};

export interface CheckoutView {
  id: string;
  plan: string;
  amountKrw: number;
  status: 'open' | 'paid' | 'failed' | 'canceled';
  installId: string;
  returnHost: string | null;
}

export interface LicenseView {
  id: string;
  subscriptionId: string;
  plan: string;
  status: 'active' | 'past_due' | 'canceled';
  periodEnd: string;
  cancelAtPeriodEnd: boolean;
  installId: string;
  token: string;
}
