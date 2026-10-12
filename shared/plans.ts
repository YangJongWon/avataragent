export type Plan = 'personal' | 'team' | 'business';

/** How often a plan is billed; a year costs ten months. */
export type BillingInterval = 'month' | 'year';

export type PlanFeature = 'members' | 'chat' | 'projectLounge' | 'officeChannels' | 'assignees' | 'activityExport' | 'companyLogo';

export interface PlanMeta {
  id: Plan;
  emoji: string;
  label: string;
  description: string;
  features: PlanFeature[];
  maxMembers: number;
  /**
   * Monthly price charged through the billing provider; 0 means free. Stored in the legacy unit the field is
   * named after: the storefront shows 1,000 units as USD 1 (shared/product-currency.ts).
   */
  priceKrw: number;
  /** The yearly price in the same unit (two months free); 0 for the free plan. */
  priceYearly: number;
}

export const PLANS: PlanMeta[] = [
  {
    id: 'personal',
    emoji: '🙋',
    label: '개인',
    description: '혼자 쓰는 회사예요. 공유 링크로 보여 주기만 할 수 있어요.',
    features: [],
    maxMembers: 0,
    priceKrw: 0,
    priceYearly: 0,
  },
  {
    id: 'team',
    emoji: '👥',
    label: '팀',
    description: '구성원과 업무를 나누고, 프로젝트 라운지에서 완성 과정과 기여를 함께 봐요.',
    features: ['members', 'chat', 'projectLounge', 'assignees'],
    maxMembers: 10,
    priceKrw: 9_000,
    priceYearly: 90_000,
  },
  {
    id: 'business',
    emoji: '🏢',
    label: '비즈니스',
    description: '팀 기능에 더해 사무실별 채널, 더 큰 조직과 활동 기록 내보내기를 써요.',
    features: ['members', 'chat', 'projectLounge', 'officeChannels', 'assignees', 'activityExport', 'companyLogo'],
    maxMembers: 50,
    priceKrw: 29_000,
    priceYearly: 290_000,
  },
];

export const INTERVAL_DAYS: Record<BillingInterval, number> = { month: 30, year: 365 };
export const isInterval = (v: unknown): v is BillingInterval => v === 'month' || v === 'year';
export const priceFor = (plan: Plan | undefined, interval: BillingInterval = 'month') =>
  interval === 'year' ? planOf(plan).priceYearly : planOf(plan).priceKrw;

export const isPlan = (v: unknown): v is Plan => PLANS.some((p) => p.id === v);
export const planOf = (id: Plan | undefined) => PLANS.find((p) => p.id === id) ?? PLANS[0];
export const planHas = (id: Plan | undefined, feature: PlanFeature) => planOf(id).features.includes(feature);
