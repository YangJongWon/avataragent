import { isTier, tierLook, type ModelEntry, type Tier, type TierLook } from './models.ts';
import { officePerf, type PerfRecord } from './performance.ts';
import { isPersonality, personalityOf, type Personality } from './personality.ts';
import { TEAMS } from './teams.ts';
import type { Agent, Office, Role, Task, TeamId } from './types.ts';

export const PLAYBOOK_FORMAT = 'avataragent-playbook';
const ROLES: Role[] = ['manager', 'researcher', 'writer', 'reviewer'];
export const MAX_RULES_CHARS = 2000;

/**
 * A shareable office setup: per-role working style, rules and model class, with its track record.
 * It never carries names, task inputs, outputs, review reasons or keys.
 */
export interface Playbook {
  format: typeof PLAYBOOK_FORMAT;
  version: 1;
  name: string;
  team: TeamId;
  exportedAt: string;
  /**
   * `modelTier` is the tier number where the playbook was made; `modelTierLook` is where it sat there (1 the lowest,
   * 3 the highest in use), so an office with other tier numbers can still pick a model of the same standing.
   */
  staff: { role: Role; personality: Personality; rules: string; modelTier: Tier; modelTierLook: TierLook; modelVendor: string; modelLabel: string }[];
  stats: PlaybookStats;
}

export interface PlaybookStats {
  completedTasks: number;
  reviews: number;
  reviewPassRate: number | null;
  firstPassRate: number | null;
  avgReviewScore: number | null;
  researchRuns: number;
  researchAccuracy: number | null;
  researchAvgMs: number | null;
  reviewerAgreement: number | null;
  costPerTaskKrw: number | null;
  valuePerTaskKrw: number | null;
}

const round = (value: number | null, digits = 0) => (value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits);

export function playbookStats(office: Office, agents: Agent[], records: PerfRecord[], tasks: Task[]): PlaybookStats {
  const perf = officePerf(office.id, agents, records);
  const done = tasks.filter((t) => t.officeId === office.id && t.status === 'completed');
  const per = (sum: number) => (done.length ? Math.round(sum / done.length) : null);
  return {
    completedTasks: done.length,
    reviews: perf.review.count,
    reviewPassRate: round(perf.review.passRate, 3),
    firstPassRate: round(perf.review.firstPassRate, 3),
    avgReviewScore: round(perf.review.avgScore, 1),
    researchRuns: perf.research.runs,
    researchAccuracy: round(perf.research.accuracy, 1),
    researchAvgMs: round(perf.research.avgMs),
    reviewerAgreement: perf.review.falsePassRate === null ? null : round(1 - perf.review.falsePassRate, 3),
    costPerTaskKrw: per(done.reduce((sum, t) => sum + t.costKrw, 0)),
    valuePerTaskKrw: per(done.reduce((sum, t) => sum + (t.value?.recognizedKrw ?? 0), 0)),
  };
}

export function buildPlaybook(office: Office, agents: Agent[], records: PerfRecord[], tasks: Task[], models: ModelEntry[], name: string): Playbook {
  const staff = agents.filter((a) => a.officeId === office.id);
  return {
    format: PLAYBOOK_FORMAT,
    version: 1,
    name: name.trim().slice(0, 60) || `${TEAMS[office.team].name} 플레이북`,
    team: office.team,
    exportedAt: new Date().toISOString(),
    staff: ROLES.flatMap((role) => {
      const agent = staff.find((a) => a.role === role);
      if (!agent) return [];
      const model = models.find((m) => m.id === agent.model);
      return [{ role, personality: agent.personality, rules: agent.rules, modelTier: model?.tier ?? 2, modelTierLook: model ? tierLook(model.tier) : 2, modelVendor: model?.vendor ?? '', modelLabel: model?.label ?? '' }];
    }),
    stats: playbookStats(office, agents, records, tasks),
  };
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Validates an untrusted file; unknown fields are dropped. */
export function parsePlaybook(input: unknown): Playbook {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  if (raw.format !== PLAYBOOK_FORMAT) throw new Error('플레이북 파일이 아니에요.');
  if (raw.version !== 1) throw new Error('이 버전의 플레이북은 아직 읽을 수 없어요.');
  if (typeof raw.team !== 'string' || !(raw.team in TEAMS)) throw new Error('플레이북의 팀 종류를 알 수 없어요.');
  const staffIn = Array.isArray(raw.staff) ? raw.staff : [];
  const staff: Playbook['staff'] = [];
  for (const item of staffIn) {
    const s = (item ?? {}) as Record<string, unknown>;
    const role = s.role as Role;
    if (!ROLES.includes(role) || staff.some((x) => x.role === role)) continue;
    const tier = isTier(s.modelTier) ? s.modelTier : 2;
    const look = num(s.modelTierLook);
    staff.push({
      role,
      personality: isPersonality(s.personality) ? s.personality : 'balanced',
      rules: str(s.rules, MAX_RULES_CHARS),
      modelTier: tier,
      // Files from before tiers were open-ended only had 1 to 3, which is the look itself.
      modelTierLook: look === 1 || look === 2 || look === 3 ? look : tier <= 1 ? 1 : tier >= 3 ? 3 : 2,
      modelVendor: str(s.modelVendor, 40),
      modelLabel: str(s.modelLabel, 60),
    });
  }
  if (!staff.length) throw new Error('플레이북에 직원 설정이 없어요.');
  const st = (raw.stats ?? {}) as Record<string, unknown>;
  const stat = (key: keyof PlaybookStats) => num(st[key]);
  return {
    format: PLAYBOOK_FORMAT,
    version: 1,
    name: str(raw.name, 60) || '이름 없는 플레이북',
    team: raw.team as TeamId,
    exportedAt: str(raw.exportedAt, 40),
    staff,
    stats: {
      completedTasks: stat('completedTasks') ?? 0,
      reviews: stat('reviews') ?? 0,
      reviewPassRate: stat('reviewPassRate'),
      firstPassRate: stat('firstPassRate'),
      avgReviewScore: stat('avgReviewScore'),
      researchRuns: stat('researchRuns') ?? 0,
      researchAccuracy: stat('researchAccuracy'),
      researchAvgMs: stat('researchAvgMs'),
      reviewerAgreement: stat('reviewerAgreement'),
      costPerTaskKrw: stat('costPerTaskKrw'),
      valuePerTaskKrw: stat('valuePerTaskKrw'),
    },
  };
}

/** Phrases that try to override safety, leak data or act outside the office; shown before anything is applied. */
const SUSPICIOUS: [RegExp, string][] = [
  [/(무시|ignore|disregard|override|우회|bypass)/i, '다른 규칙을 무시하거나 우회하라는 표현'],
  [/(안전\s*규칙|safety|system\s*prompt|시스템\s*프롬프트|jailbreak|탈옥)/i, '안전 규칙이나 시스템 지시를 건드리는 표현'],
  [/(api\s*key|비밀번호|password|token|토큰|secret|\.env)/i, '키·비밀번호를 다루는 표현'],
  [/(https?:\/\/|www\.)/i, '외부 주소'],
  [/(보내|전송|메일을\s*발송|upload|업로드|send|post\s+to|webhook)/i, '외부로 보내거나 올리라는 표현'],
  [/(삭제|지워|delete|drop\s+table|rm\s+-)/i, '지우라는 표현'],
];

export function rulesWarnings(rules: string) {
  return SUSPICIOUS.filter(([pattern]) => pattern.test(rules)).map(([, label]) => label);
}

export interface PlaybookChange {
  agentId: string;
  role: Role;
  field: 'personality' | 'rules' | 'model';
  from: string;
  to: string;
  warnings: string[];
}

/**
 * The same model when this office has it (same company and name), else one of the same standing (lowest, between,
 * highest): at the same company first, then the cheapest anywhere. Tier numbers differ between offices, standing does not.
 */
function matchModel(models: ModelEntry[], setup: Playbook['staff'][number]) {
  const cheapest = (list: ModelEntry[]) => [...list].sort((a, b) => a.priceOutPerMTokUsd - b.priceOutPerMTokUsd)[0];
  const sameStanding = models.filter((m) => tierLook(m.tier) === setup.modelTierLook);
  return (
    models.find((m) => m.vendor === setup.modelVendor && m.label === setup.modelLabel) ??
    cheapest(sameStanding.filter((m) => m.vendor === setup.modelVendor)) ??
    cheapest(sameStanding)
  );
}

/** What applying the playbook to this office would change; every agent of a role takes that role's setup. */
export function playbookChanges(playbook: Playbook, office: Office, agents: Agent[], models: ModelEntry[], includeModel: boolean): PlaybookChange[] {
  if (playbook.team !== office.team) throw new Error(`${TEAMS[playbook.team].name} 플레이북은 같은 종류의 사무실에만 적용할 수 있어요.`);
  const changes: PlaybookChange[] = [];
  for (const agent of agents.filter((a) => a.officeId === office.id)) {
    const setup = playbook.staff.find((s) => s.role === agent.role);
    if (!setup) continue;
    const add = (field: PlaybookChange['field'], from: string, to: string, warnings: string[] = []) => {
      if (from !== to) changes.push({ agentId: agent.id, role: agent.role, field, from, to, warnings });
    };
    add('personality', agent.personality, setup.personality);
    add('rules', agent.rules, setup.rules, rulesWarnings(setup.rules));
    if (includeModel) {
      const model = matchModel(models, setup);
      if (model) add('model', agent.model, model.id);
    }
  }
  return changes;
}

export const changeText = (change: PlaybookChange, models: ModelEntry[]) => {
  const label = (v: string) =>
    change.field === 'personality' ? personalityOf(v as Personality).label : change.field === 'model' ? (models.find((m) => m.id === v)?.label ?? v) : v;
  return { from: label(change.from), to: label(change.to) };
};
