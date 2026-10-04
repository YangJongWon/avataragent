export type Plan = 'personal' | 'team' | 'business';

export type PlanFeature = 'members' | 'chat' | 'officeChannels';

export interface PlanMeta {
  id: Plan;
  emoji: string;
  label: string;
  description: string;
  features: PlanFeature[];
  maxMembers: number;
}

/** Feature switches only; billing is not wired yet. */
export const PLANS: PlanMeta[] = [
  {
    id: 'personal',
    emoji: '🙋',
    label: '개인',
    description: '혼자 쓰는 회사예요. 공유 링크로 보여 주기만 할 수 있어요.',
    features: [],
    maxMembers: 0,
  },
  {
    id: 'team',
    emoji: '👥',
    label: '팀',
    description: '구성원 계정으로 함께 일하고, 회사 전체 채팅과 업무별 대화를 써요.',
    features: ['members', 'chat'],
    maxMembers: 10,
  },
  {
    id: 'business',
    emoji: '🏢',
    label: '비즈니스',
    description: '팀 기능에 더해 사무실별 채널로 부서마다 따로 이야기해요.',
    features: ['members', 'chat', 'officeChannels'],
    maxMembers: 50,
  },
];

export const isPlan = (v: unknown): v is Plan => PLANS.some((p) => p.id === v);
export const planOf = (id: Plan | undefined) => PLANS.find((p) => p.id === id) ?? PLANS[0];
export const planHas = (id: Plan | undefined, feature: PlanFeature) => planOf(id).features.includes(feature);
