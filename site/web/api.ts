import type { PlanMeta } from '../../shared/plans.ts';
import { tpl } from './i18n.tsx';

export interface Me {
  account: { id: string; email: string; name: string; avatarUrl: string; role: 'user' | 'admin'; handle: string | null } | null;
  providers: { email: boolean; google: boolean; github: boolean };
  /** Where the visitor connects from, if the host in front of the site says. */
  country?: string | null;
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? tpl('요청 실패 ({status})', { status: res.status }));
  return data as T;
}

export const siteApi = {
  me: () => call<Me>('GET', '/api/me'),
  sendLink: (email: string, next: string) => call<void>('POST', '/api/auth/email', { email, next }),
  logout: () => call<void>('POST', '/api/auth/logout', {}),
  plans: () => call<PlanMeta[]>('GET', '/api/plans'),
  docs: (lang: string) => call<{ slug: string; title: string }[]>('GET', `/api/docs?lang=${lang}`),
  doc: (slug: string, lang: string) => call<{ title: string; markdown: string; language: string }>('GET', `/api/docs/${encodeURIComponent(slug)}?lang=${lang}`),
  startCheckout: (input: { plan: string; install: string; ref?: string; returnUrl?: string; interval?: 'month' | 'year' }) => call<{ url: string }>('POST', '/api/checkout', input),
  checkout: (id: string) => call<CheckoutView>('GET', `/api/checkout/${encodeURIComponent(id)}`),
  paymentsConfig: () => call<{ provider: string; env?: string; token?: string }>('GET', '/api/payments/config'),
  mockPay: (id: string, paid: boolean) => call<{ redirect: string | null }>('POST', `/api/payments/mock/${encodeURIComponent(id)}`, { result: paid ? 'paid' : 'failed' }),
  licenses: () => call<LicenseView[]>('GET', '/api/licenses'),
  transfer: (id: string, install: string) => call<{ token: string }>('POST', `/api/licenses/${encodeURIComponent(id)}/transfer`, { install }),
  setCancel: (subscriptionId: string, cancel: boolean) => call<LicenseView[]>('POST', `/api/subscriptions/${encodeURIComponent(subscriptionId)}/${cancel ? 'cancel' : 'resume'}`, {}),
  items: (query: Record<string, string>) => call<{ items: ItemCard[]; total: number }>('GET', `/api/items?${new URLSearchParams(query)}`),
  myItems: () => call<ItemCard[]>('GET', '/api/me/items'),
  item: (id: string) => call<ItemDetail>('GET', `/api/items/${encodeURIComponent(id)}`),
  like: (id: string, on: boolean) => call<{ liked: boolean; likes: number }>('POST', `/api/items/${encodeURIComponent(id)}/like`, { on }),
  report: (id: string, reason: string) => call<{ ok: true }>('POST', `/api/items/${encodeURIComponent(id)}/report`, { reason }),
  setItemStatus: (id: string, status: ItemStatus) => call<ItemDetail | { id: string; status: 'removed' }>('POST', `/api/items/${encodeURIComponent(id)}/status`, { status }),
  setVerified: (id: string, verified: boolean) => call<ItemDetail>('POST', `/api/items/${encodeURIComponent(id)}/verified`, { verified }),
  ranking: (period: string) => call<RankRow[]>('GET', `/api/ranking?period=${encodeURIComponent(period)}`),
  user: (handle: string) => call<Profile>('GET', `/api/users/${encodeURIComponent(handle)}`),
  updateProfile: (input: { handle?: string; name?: string; bio?: string; links?: string[] }) => call<Profile>('PUT', '/api/me/profile', input),
  posts: (query: Record<string, string>) => call<{ posts: PostCard[]; total: number }>('GET', `/api/posts?${new URLSearchParams(query)}`),
  post: (id: string) => call<PostView>('GET', `/api/posts/${encodeURIComponent(id)}`),
  createPost: (input: { category: string; title: string; body: string }) => call<{ id: string }>('POST', '/api/posts', input),
  editPost: (id: string, input: { title: string; body: string }) => call<PostView>('PUT', `/api/posts/${encodeURIComponent(id)}`, input),
  removePost: (id: string) => call<{ ok: true }>('DELETE', `/api/posts/${encodeURIComponent(id)}`),
  comment: (postId: string, body: string) => call<{ id: string }>('POST', `/api/posts/${encodeURIComponent(postId)}/comments`, { body }),
  editComment: (id: string, body: string) => call<{ ok: true }>('PUT', `/api/comments/${encodeURIComponent(id)}`, { body }),
  removeComment: (id: string) => call<{ ok: true }>('DELETE', `/api/comments/${encodeURIComponent(id)}`),
  accept: (postId: string, commentId: string | null) => call<PostView>('POST', `/api/posts/${encodeURIComponent(postId)}/accept`, { commentId }),
  pin: (postId: string, pinned: boolean) => call<PostView>('POST', `/api/posts/${encodeURIComponent(postId)}/pin`, { pinned }),
  reportForum: (type: 'post' | 'comment', id: string, reason: string) => call<{ ok: true }>('POST', '/api/reports', { type, id, reason }),
  adminQueue: () => call<QueueEntry[]>('GET', '/api/admin/queue'),
  adminResolve: (type: QueueEntry['type'], id: string, action: 'restore' | 'remove') => call<{ ok: true }>('POST', '/api/admin/resolve', { type, id, action }),
  adminUsers: (q: string) => call<AdminUser[]>('GET', `/api/admin/users?q=${encodeURIComponent(q)}`),
  adminSuspend: (id: string, on: boolean, reason: string) => call<{ ok: true }>('POST', `/api/admin/users/${encodeURIComponent(id)}/suspend`, { on, reason }),
  adminLog: () => call<AuditEntry[]>('GET', '/api/admin/log'),
  setPrice: (id: string, priceKrw: number) => call<{ priceKrw: number }>('POST', `/api/items/${encodeURIComponent(id)}/price`, { priceKrw }),
  buyItem: (id: string) => call<{ url: string }>('POST', `/api/items/${encodeURIComponent(id)}/checkout`, {}),
  purchases: () => call<Purchase[]>('GET', '/api/me/purchases'),
  earnings: () => call<Earnings>('GET', '/api/me/earnings'),
  adminBalances: () => call<{ creatorId: string; handle: string | null; email: string; balance: number; gross: number; lastPayout: string | null }[]>('GET', '/api/admin/balances'),
  adminSales: () => call<{ id: string; title: string; buyer: string; seller: string | null; amountKrw: number; feeKrw: number; status: string; at: string }[]>('GET', '/api/admin/sales'),
  adminRefund: (purchaseId: string, reason: string) => call<{ ok: true }>('POST', `/api/admin/purchases/${encodeURIComponent(purchaseId)}/refund`, { reason }),
  adminPayout: (creatorId: string, amountKrw: number, note: string) => call<{ balance: number }>('POST', '/api/admin/payouts', { creatorId, amountKrw, note }),
  async upload(file: File, query: { type: ItemType; item?: string; tags?: string; license?: string }) {
    const params = new URLSearchParams(Object.entries(query).filter(([, v]) => v) as [string, string][]);
    const res = await fetch(`/api/items?${params}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: file });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error ?? tpl('올리지 못했어요 ({status})', { status: res.status }));
    return data as { id: string; version: number; label: string; warnings: string[] };
  },
};

export type ItemType = 'theme' | 'flow' | 'playbook';
export type ItemStatus = 'published' | 'hidden' | 'removed';

export interface ItemCard {
  id: string;
  type: ItemType;
  title: string;
  summary: string;
  tags: string[];
  license: string;
  verified: boolean;
  version: string;
  /** 0 for free. */
  priceKrw: number;
  downloads: number;
  likes: number;
  owner: { handle: string | null; name: string };
  preview: string | null;
  updatedAt: string;
  status?: ItemStatus;
}

export interface ItemDetail extends ItemCard {
  liked: boolean;
  mine: boolean;
  /** Free, mine, or bought: the download works. */
  owned: boolean;
  hiddenReason?: string | null;
  details: Record<string, unknown>;
  warnings: string[];
  versions: { version: number; label: string; size: number; sha256: string; createdAt: string }[];
}

export interface CheckoutView {
  /** Set once paid: where to go next. */
  redirect: string | null;
  id: string;
  kind: 'plan' | 'item';
  itemId: string | null;
  itemTitle: string | null;
  plan: string;
  interval: 'month' | 'year';
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
  interval: 'month' | 'year';
  installId: string;
  token: string;
}

export interface Badge {
  id: string;
  icon: string;
  label: string;
}

export interface RankRow {
  handle: string;
  name: string;
  avatarUrl: string;
  score: number;
  downloads: number;
  likes: number;
  items: number;
}

export interface Profile {
  handle: string;
  name: string;
  avatarUrl: string;
  bio: string;
  links: string[];
  joinedAt: string;
  suspended: boolean;
  mine: boolean;
  badges: Badge[];
  totals: { items: number; downloads: number; likes: number; posts: number };
  monthRank: number | null;
  items: ItemCard[];
}

export type Category = 'notice' | 'question' | 'tip' | 'idea' | 'showcase';
export interface Author {
  handle: string | null;
  name: string;
  avatarUrl: string;
}

export interface PostCard {
  id: string;
  category: Category;
  title: string;
  excerpt: string;
  pinned: boolean;
  answered: boolean;
  comments: number;
  author: Author;
  createdAt: string;
  lastActivityAt: string;
}

export interface PostView {
  id: string;
  category: Category;
  title: string;
  body: string;
  status: 'published' | 'hidden' | 'removed';
  hiddenReason?: string | null;
  pinned: boolean;
  acceptedCommentId: string | null;
  author: Author;
  createdAt: string;
  editedAt: string | null;
  mine: boolean;
  canEdit: boolean;
  canAccept: boolean;
  comments: { id: string; body: string; status: string; author: Author; createdAt: string; editedAt: string | null; mine: boolean; accepted: boolean }[];
}

export interface QueueEntry {
  type: 'item' | 'post' | 'comment';
  id: string;
  postId?: string;
  title: string;
  status: string;
  hiddenReason: string | null;
  author: { handle: string | null; email: string };
  reports: { reason: string; at: string; by: string | null }[];
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: 'active' | 'suspended';
  handle: string | null;
  createdAt: string;
  items: number;
  posts: number;
}

export interface AuditEntry {
  id: string;
  action: string;
  target: string;
  detail: Record<string, unknown>;
  actor: string | null;
  at: string;
}

export interface Purchase {
  id: string;
  itemId: string;
  title: string;
  amountKrw: number;
  status: 'paid' | 'refunded';
  available: boolean;
  createdAt: string;
}

export interface Earnings {
  balance: number;
  gross: number;
  fees: number;
  refunds: number;
  payouts: number;
  sales: number;
  share: number;
  entries: { kind: 'sale' | 'fee' | 'refund' | 'fee_refund' | 'payout'; amountKrw: number; note: string; title: string | null; at: string }[];
}
