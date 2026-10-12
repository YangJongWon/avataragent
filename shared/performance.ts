import { tpl, type Vars } from './i18n.ts';
import { modelOf, type ModelEntry } from './models.ts';
import { personalityLabel, personalityOf, type Personality } from './personality.ts';
import type { Agent, Role } from './types.ts';

interface RecordBase {
  id: string;
  at: string;
  officeId: string;
  taskId: string;
  taskType: string;
  stepId: string;
  stepLabel: string;
  /** Who did the work being measured. */
  agentId: string;
  model: string;
  personality: Personality;
  durationMs: number;
}

export interface ResearchRecord extends RecordBase {
  kind: 'research';
  toolCalls: number;
  toolFailures: number;
  /** The reviewer's 0~100 judgement of how accurate and well-supported the notes were; null until a review scores them. */
  accuracy: number | null;
  accuracyNote?: string;
}

export interface ReviewRecord extends RecordBase {
  kind: 'review';
  writerId: string;
  writerModel: string;
  writerPersonality: Personality;
  /** Draft version under review; 1 means the first try. */
  attempt: number;
  approved: boolean;
  score: number;
  reason: string;
  /** What the user decided on this round's result; tells whether the reviewer judged right. */
  userVerdict: 'approved' | 'changes' | null;
}

export type PerfRecord = ResearchRecord | ReviewRecord;

export const MAX_PERF_RECORDS = 400;
export const MAX_IMPROVEMENT_LOGS = 30;
/** Fewer samples than this are noise, so no ranking or suggestion is based on them. */
export const MIN_SAMPLES = 3;
const SLOW_RESEARCH_MS = 90_000;

export interface Improvement {
  /** Stable per change, so the same suggestion keeps its id between recomputations. */
  id: string;
  officeId: string;
  agentId: string;
  field: 'personality' | 'model';
  from: string;
  to: string;
  /** Catalogue key of the reason sentence; `improvementReasonVars` fills its holes. */
  reasonKey: string;
  /** Raw values for the key's holes: numbers plus personality and model ids. */
  reasonVars: Vars;
  /** Safe changes don't raise cost; an office with auto-improve applies them by itself. */
  safe: boolean;
}

export interface ImprovementLog extends Improvement {
  appliedAt: string;
  auto: boolean;
}

const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const rate = (part: number, whole: number) => (whole ? part / whole : null);

export const researchOf = (records: PerfRecord[]) => records.filter((r): r is ResearchRecord => r.kind === 'research');
export const reviewsOf = (records: PerfRecord[]) => records.filter((r): r is ReviewRecord => r.kind === 'review');

export function researchStats(records: ResearchRecord[]) {
  const scored = records.filter((r) => r.accuracy !== null);
  return {
    runs: records.length,
    scored: scored.length,
    accuracy: avg(scored.map((r) => r.accuracy!)),
    avgMs: avg(records.map((r) => r.durationMs)),
    toolCalls: records.reduce((sum, r) => sum + r.toolCalls, 0),
    toolFailures: records.reduce((sum, r) => sum + r.toolFailures, 0),
  };
}

export function reviewStats(records: ReviewRecord[]) {
  const first = records.filter((r) => r.attempt === 1);
  const passed = records.filter((r) => r.approved);
  const checked = passed.filter((r) => r.userVerdict !== null);
  return {
    count: records.length,
    approved: passed.length,
    passRate: rate(passed.length, records.length),
    firstTries: first.length,
    firstPassRate: rate(first.filter((r) => r.approved).length, first.length),
    avgScore: avg(records.map((r) => r.score)),
    /** Passed by the reviewer and then sent back by the user. */
    checked: checked.length,
    falsePasses: checked.filter((r) => r.userVerdict === 'changes').length,
    falsePassRate: rate(checked.filter((r) => r.userVerdict === 'changes').length, checked.length),
  };
}

export interface AgentPerf {
  agentId: string;
  research: ReturnType<typeof researchStats>;
  /** Reviews of this agent's drafts. */
  writing: ReturnType<typeof reviewStats>;
  /** Reviews this agent made. */
  reviewing: ReturnType<typeof reviewStats>;
}

const sameSetup = (agent: Agent) => (r: RecordBase) => r.model === agent.model && r.personality === agent.personality;
const sameWriterSetup = (agent: Agent) => (r: ReviewRecord) => r.writerModel === agent.model && r.writerPersonality === agent.personality;

/** `current` keeps only records made with the agent's present model and personality, so a change starts a fresh count. */
export function agentPerf(agent: Agent, records: PerfRecord[], current = false): AgentPerf {
  const research = researchOf(records).filter((r) => r.agentId === agent.id && (!current || sameSetup(agent)(r)));
  const reviews = reviewsOf(records);
  return {
    agentId: agent.id,
    research: researchStats(research),
    writing: reviewStats(reviews.filter((r) => r.writerId === agent.id && (!current || sameWriterSetup(agent)(r)))),
    reviewing: reviewStats(reviews.filter((r) => r.agentId === agent.id && (!current || sameSetup(agent)(r)))),
  };
}

export function officePerf(officeId: string, agents: Agent[], records: PerfRecord[]) {
  const mine = records.filter((r) => r.officeId === officeId);
  const reviews = reviewsOf(mine);
  return {
    research: researchStats(researchOf(mine)),
    review: reviewStats(reviews),
    agents: agents.filter((a) => a.officeId === officeId).map((a) => agentPerf(a, mine)),
    recentRejections: reviews.filter((r) => !r.approved).slice(0, 5),
  };
}

/** Higher is better; null when there are too few samples to judge. */
function roleScore(role: Role, perf: AgentPerf): number | null {
  if (role === 'researcher') return perf.research.scored >= MIN_SAMPLES ? perf.research.accuracy! / 100 : null;
  if (role === 'writer') return perf.writing.count >= MIN_SAMPLES ? perf.writing.passRate : null;
  if (role === 'reviewer') return perf.reviewing.checked >= MIN_SAMPLES ? 1 - perf.reviewing.falsePassRate! : null;
  return null;
}

const NEUTRAL_SCORE = 0.6;

/** Orders agents so the proven performer of each role comes first; unproven agents count as average. */
export function rankAgents(agents: Agent[], records: PerfRecord[]): Agent[] {
  const score = new Map(agents.map((a) => [a.id, roleScore(a.role, agentPerf(a, records)) ?? NEUTRAL_SCORE]));
  return agents
    .map((agent, index) => ({ agent, index }))
    .sort((a, b) => (a.agent.role === b.agent.role ? score.get(b.agent.id)! - score.get(a.agent.id)! || a.index - b.index : a.index - b.index))
    .map(({ agent }) => agent);
}

/** Past mistakes in the same office and task type, worded for a prompt. Empty when there is nothing to learn from. */
export function lessonsFor(records: PerfRecord[], officeId: string, taskType: string, kind: 'draft' | 'research', excludeTaskId: string) {
  const similar = records.filter((r) => r.officeId === officeId && r.taskType === taskType && r.taskId !== excludeTaskId);
  const lines =
    kind === 'draft'
      ? reviewsOf(similar)
          .filter((r) => !r.approved)
          .map((r) => r.reason)
      : researchOf(similar)
          .filter((r) => r.accuracy !== null && r.accuracy < 70 && r.accuracyNote)
          .map((r) => r.accuracyNote!);
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))].slice(0, 3);
}

const pct = (value: number | null) => (value === null ? '-' : `${Math.round(value * 100)}%`);

/** For AI prompts, which stay Korean so agent behaviour does not depend on the UI language. */
export const seconds = (ms: number | null) => (ms === null ? '-' : `${Math.round(ms / 1000)}초`);

/** Same value for the screen, in the active display language. */
export const secondsLabel = (ms: number | null) => (ms === null ? '-' : tpl('{n}초', { n: Math.round(ms / 1000) }));

/** One line per agent for the manager's planning prompt. */
export function perfLines(agents: Agent[], records: PerfRecord[]) {
  return agents
    .map((agent) => {
      const p = agentPerf(agent, records);
      const parts = [
        p.research.scored ? `조사 정확도 ${Math.round(p.research.accuracy!)}점(${p.research.scored}회, 평균 ${seconds(p.research.avgMs)})` : '',
        p.writing.count ? `작성물 검수 통과 ${p.writing.approved}/${p.writing.count}` : '',
        p.reviewing.checked ? `검수 판단이 사용자와 어긋난 비율 ${pct(p.reviewing.falsePassRate)}` : '',
      ].filter(Boolean);
      return parts.length ? `- ${agent.id} ${agent.name}: ${parts.join(', ')}` : '';
    })
    .filter(Boolean);
}

/** The nearest tier up (or down) the same company has, skipping tiers it has no model in; cheapest first. */
function neighborModel(models: ModelEntry[], current: ModelEntry | undefined, step: 1 | -1) {
  if (!current) return undefined;
  const same = models.filter((m) => m.vendor === current.vendor && (m.tier - current.tier) * step > 0);
  if (!same.length) return undefined;
  const next = step > 0 ? Math.min(...same.map((m) => m.tier)) : Math.max(...same.map((m) => m.tier));
  return same.filter((m) => m.tier === next).sort((a, b) => a.priceOutPerMTokUsd - b.priceOutPerMTokUsd)[0];
}

/**
 * Why a change is suggested, as catalogue keys with `{holes}`. Each is a whole
 * sentence rather than a prefix plus a suffix, because the word order of a joined
 * sentence would only fit Korean. `{personality}` and `{model}` stay as ids until
 * `improvementReasonVars` swaps in the label of the reader's language.
 */
const REASON = {
  lowAccuracy: {
    to: '조사 정확도가 평균 {score}점으로 낮아요. {personality} 성향으로 바꿔 보세요.',
    model: '조사 정확도가 평균 {score}점으로 낮아요. 이미 {personality} 성향이라 한 단계 위 모델({model})을 써 보세요. 비용이 늘어요.',
  },
  slowResearch: '조사는 정확한데({score}점) 평균 {slow}로 느려요. {personality} 성향으로 바꾸면 빨라지고 비용도 줄어요.',
  lowPassRate: {
    to: '작성물이 검수를 {count}번 중 {approved}번만 통과했어요. {personality} 성향으로 바꿔 보세요.',
    model: '작성물이 검수를 {count}번 중 {approved}번만 통과했어요. 이미 {personality} 성향이라 한 단계 위 모델({model})을 써 보세요. 비용이 늘어요.',
  },
  falsePasses: {
    to: '검수에서 통과시킨 결과를 사용자가 {checked}번 중 {falsePasses}번 다시 고치게 했어요. {personality} 성향으로 바꿔 보세요.',
    model: '검수에서 통과시킨 결과를 사용자가 {checked}번 중 {falsePasses}번 다시 고치게 했어요. 이미 {personality} 성향이라 한 단계 위 모델({model})을 써 보세요. 비용이 늘어요.',
  },
  strongReviews: '검수가 {count}번 모두 통과했고 사용자와도 어긋나지 않았어요. 한 단계 아래 모델({model})로도 충분할 수 있어요. 비용이 줄어요.',
} as const;

/** Fills a reason key's holes, translating the personality and model ids it carries. */
export const improvementReasonVars = (reasonVars: Vars): Vars => ({
  ...reasonVars,
  ...(reasonVars.personality ? { personality: personalityLabel(reasonVars.personality as Personality) } : {}),
  ...(reasonVars.model ? { model: modelOf(String(reasonVars.model)).label } : {}),
});

/**
 * Rule-based suggestions from each agent's records under its current setup.
 * A change that auto-improve already moved away from is never auto-applied again, so it cannot flip back and forth.
 */
export function suggestImprovements(officeId: string, agents: Agent[], records: PerfRecord[], models: ModelEntry[], history: ImprovementLog[] = []) {
  const out: Improvement[] = [];
  const mine = records.filter((r) => r.officeId === officeId);
  const add = (agent: Agent, field: Improvement['field'], to: string, reasonKey: string, reasonVars: Vars, safe: boolean) => {
    const from = field === 'personality' ? agent.personality : agent.model;
    if (from === to || out.some((o) => o.agentId === agent.id && o.field === field)) return;
    const revert = history.some((h) => h.auto && h.agentId === agent.id && h.field === field && h.from === to);
    out.push({ id: `${agent.id}:${field}:${to}`, officeId, agentId: agent.id, field, from, to, reasonKey, reasonVars, safe: safe && !revert });
  };
  const personalityChange = (agent: Agent, to: Personality, reason: { to: string; model: string }, vars: Vars) => {
    if (agent.personality !== to) return add(agent, 'personality', to, reason.to, { ...vars, personality: to }, true);
    const better = neighborModel(models, models.find((m) => m.id === agent.model), 1);
    if (better) add(agent, 'model', better.id, reason.model, { ...vars, personality: to, model: better.id }, false);
  };

  for (const agent of agents.filter((a) => a.officeId === officeId)) {
    const p = agentPerf(agent, mine, true);
    const { research, writing, reviewing } = p;
    if (research.scored >= MIN_SAMPLES && research.accuracy! < 70) {
      personalityChange(agent, 'careful', REASON.lowAccuracy, { score: Math.round(research.accuracy!) });
    } else if (research.scored >= MIN_SAMPLES && research.accuracy! >= 85 && research.avgMs! > SLOW_RESEARCH_MS && agent.personality === 'careful') {
      add(agent, 'personality', 'balanced', REASON.slowResearch, { score: Math.round(research.accuracy!), slow: secondsLabel(research.avgMs), personality: 'balanced' }, true);
    }
    if (writing.count >= MIN_SAMPLES && writing.passRate! < 0.5) {
      personalityChange(agent, 'careful', REASON.lowPassRate, { count: writing.count, approved: writing.approved });
    }
    if (reviewing.checked >= MIN_SAMPLES && reviewing.falsePassRate! >= 0.34) {
      personalityChange(agent, 'critical', REASON.falsePasses, { checked: reviewing.checked, falsePasses: reviewing.falsePasses });
    } else if (reviewing.checked >= 5 && reviewing.falsePasses === 0 && reviewing.passRate === 1 && reviewing.avgScore! >= 90) {
      const cheaper = neighborModel(models, models.find((m) => m.id === agent.model), -1);
      if (cheaper) add(agent, 'model', cheaper.id, REASON.strongReviews, { count: reviewing.count, model: cheaper.id }, false);
    }
  }
  return out;
}
