import { TEAMS, taskTypeOf } from './teams.ts';
import type {
  Agent,
  FlowTemplateStep,
  Role,
  StepKind,
  StepLoop,
  Task,
  TeamId,
  WorkflowStep,
  WorkflowStepInput,
} from './types.ts';

export const MAX_PLAN_STEPS = 10;

export const STEP_KIND: Record<StepKind, { icon: string; title: string; role: Role | null; hint: string }> = {
  brief: { icon: '📌', title: '접수·지시', role: 'manager', hint: '요청을 읽고 작업 지시서를 만들어요.' },
  research: { icon: '🔍', title: '조사·분석', role: 'researcher', hint: '자료를 모으거나 분석 메모를 남겨요. 여러 개 둘 수 있어요.' },
  draft: { icon: '✍️', title: '결과물 작성', role: 'writer', hint: '최종 결과물을 써요. 하나만 둘 수 있어요.' },
  review: { icon: '🧐', title: '검토', role: 'reviewer', hint: '반려 조건에 걸리면 정한 단계로 되돌아가요.' },
  approval: { icon: '🙋', title: '사용자 승인', role: null, hint: '내가 승인하면 반영돼요.' },
};

/** Steps must follow this order; research and review may repeat. */
const KIND_RANK: Record<StepKind, number> = { brief: 0, research: 1, draft: 2, review: 3, approval: 4 };

export const MAX_LOOP = 3;
export const LOOPABLE: StepKind[] = ['research', 'draft', 'review'];
export const LOOP_PLACEHOLDER: Partial<Record<StepKind, string>> = {
  research: '예: 근거 자료가 3개 미만이면',
  draft: '예: 조사 메모로는 내용을 채우기 부족하면',
  review: '예: 검토 기준에 못 미치면',
};
const REVIEW_LOOP_WHEN = '검토 기준에 못 미치면';
const REVIEW_LOOP_MAX = 2;

/** Steps a loop on steps[index] may return to: anything up to itself, or up to the draft for reviews. */
export function loopTargets(steps: { kind: StepKind }[], index: number): number[] {
  if (!LOOPABLE.includes(steps[index].kind)) return [];
  const last = steps[index].kind === 'review' ? steps.findIndex((s) => s.kind === 'draft') : index;
  return Array.from({ length: last + 1 }, (_, i) => i);
}

export function reviewLoop(steps: { kind: StepKind }[]): StepLoop {
  return { to: steps.findIndex((s) => s.kind === 'draft'), when: REVIEW_LOOP_WHEN, max: REVIEW_LOOP_MAX };
}

export function parseLoop(raw: unknown): StepLoop | null {
  if (!raw || typeof raw !== 'object') return null;
  const loop = raw as Partial<StepLoop>;
  const to = Number(loop.to);
  const when = String(loop.when ?? '').trim().slice(0, 60);
  if (!Number.isInteger(to) || to < 0 || !when) return null;
  return { to, when, max: Math.max(1, Math.min(MAX_LOOP, Math.round(Number(loop.max) || 1))) };
}

/** Keeps loop targets pointing at the same steps after the editor moves, inserts or removes steps. */
export function remapLoops<T extends WorkflowStepInput>(steps: T[], newIndexOf: (oldIndex: number) => number | null): T[] {
  return steps.map((s) => {
    if (!s.loop) return s;
    const to = newIndexOf(s.loop.to);
    return { ...s, loop: to === null ? null : { ...s.loop, to } };
  });
}

export function loopTargetLabel(steps: { label: string }[], index: number, loop: StepLoop) {
  return loop.to === index ? '이 단계 다시' : `${steps[loop.to]?.label ?? '?'}(으)로`;
}

export function defaultFlow(team: TeamId, taskType: string): FlowTemplateStep[] {
  const type = taskTypeOf(team, taskType);
  if (type.flow) return type.flow;
  const labels = TEAMS[team].stepLabels;
  return [
    { kind: 'brief', label: labels.intake, role: 'manager' },
    { kind: 'research', label: labels.research, role: 'researcher' },
    { kind: 'draft', label: labels.write, role: 'writer' },
    { kind: 'review', label: labels.review, role: 'reviewer' },
    { kind: 'approval', label: labels.approval, role: null },
  ];
}

const agentFor = (agents: Agent[], role: Role | null) => (role ? (agents.find((a) => a.role === role)?.id ?? agents[0]?.id ?? null) : null);

export function templatePlan(team: TeamId, taskType: string, officeAgents: Agent[]): WorkflowStepInput[] {
  const flow = defaultFlow(team, taskType);
  return flow.map((s) => ({
    kind: s.kind,
    label: s.label,
    agentId: agentFor(officeAgents, s.role),
    instructions: '',
    loop: s.loop !== undefined ? s.loop : s.kind === 'review' ? reviewLoop(flow) : null,
  }));
}

/** Returns a Korean error message, or null when the plan can run. */
export function validatePlan(steps: WorkflowStepInput[], officeAgents: Agent[]): string | null {
  if (steps.length < 3) return '업무 여정에는 최소 3단계(접수·작성·승인)가 필요해요.';
  if (steps.length > MAX_PLAN_STEPS) return `업무 여정은 ${MAX_PLAN_STEPS}단계까지 만들 수 있어요.`;
  const count = (kind: StepKind) => steps.filter((s) => s.kind === kind).length;
  if (steps[0].kind !== 'brief' || count('brief') !== 1) return '첫 단계는 접수·지시 하나여야 해요.';
  if (steps.at(-1)!.kind !== 'approval' || count('approval') !== 1) return '마지막 단계는 사용자 승인 하나여야 해요.';
  if (count('draft') !== 1) return '결과물 작성 단계는 정확히 하나여야 해요.';
  for (let i = 1; i < steps.length; i++) {
    if (KIND_RANK[steps[i].kind] < KIND_RANK[steps[i - 1].kind]) {
      return '조사·분석은 결과물 작성 앞에, 검토는 결과물 작성 뒤에 와야 해요.';
    }
  }
  const ids = new Set(officeAgents.map((a) => a.id));
  for (const [i, step] of steps.entries()) {
    if (!step.label.trim()) return '이름이 빈 단계가 있어요.';
    if (step.loop) {
      if (!loopTargets(steps, i).includes(step.loop.to)) {
        return step.kind === 'review'
          ? `"${step.label}" 단계는 결과물 작성이나 그 앞 단계로만 되돌아갈 수 있어요.`
          : `"${step.label}" 단계는 자기 자신이나 앞 단계로만 되돌아갈 수 있어요.`;
      }
      if (!step.loop.when.trim()) return `"${step.label}" 단계의 반복 조건을 적어 주세요.`;
      if (!Number.isInteger(step.loop.max) || step.loop.max < 1 || step.loop.max > MAX_LOOP) {
        return `반복 횟수는 1~${MAX_LOOP}회로 정해 주세요.`;
      }
    }
    if (step.kind === 'approval') continue;
    if (!step.agentId || !ids.has(step.agentId)) return `"${step.label}" 단계의 담당자를 골라 주세요.`;
  }
  return null;
}

/** Repairs a plan proposed by an AI so it always satisfies validatePlan. */
export function normalizePlan(steps: Partial<WorkflowStepInput>[], team: TeamId, taskType: string, officeAgents: Agent[]): WorkflowStepInput[] {
  const template = templatePlan(team, taskType, officeAgents);
  const ids = new Set(officeAgents.map((a) => a.id));
  const kinds = new Set(Object.keys(KIND_RANK));
  type Item = { step: WorkflowStepInput; origin: number; rawLoop: StepLoop | null };
  const cleaned: Item[] = steps
    .map((s, origin) => ({ s, origin }))
    .filter((x): x is { s: Partial<WorkflowStepInput> & { kind: StepKind }; origin: number } => typeof x.s?.kind === 'string' && kinds.has(x.s.kind))
    .map(({ s, origin }) => ({
      origin,
      rawLoop: parseLoop(s.loop),
      step: {
        kind: s.kind,
        label: String(s.label ?? '').trim().slice(0, 20) || STEP_KIND[s.kind].title,
        agentId: s.kind === 'approval' ? null : s.agentId && ids.has(s.agentId) ? s.agentId : agentFor(officeAgents, STEP_KIND[s.kind].role),
        instructions: String(s.instructions ?? '').trim().slice(0, 300),
      },
    }))
    .sort((a, b) => KIND_RANK[a.step.kind] - KIND_RANK[b.step.kind]);

  const fromTemplate = (kind: StepKind): Item => ({ step: { ...template.find((s) => s.kind === kind)!, loop: null }, origin: -1, rawLoop: null });
  const single = (kind: StepKind) => cleaned.find((s) => s.step.kind === kind) ?? fromTemplate(kind);
  const research = cleaned.filter((s) => s.step.kind === 'research');
  const reviews = cleaned.filter((s) => s.step.kind === 'review');
  while (3 + research.length + reviews.length > MAX_PLAN_STEPS) {
    if (research.length > 0) research.pop();
    else reviews.pop();
  }
  const items = [single('brief'), ...research, single('draft'), ...reviews, single('approval')];
  const plan = items.map((item) => item.step);
  return items.map((item, i) => {
    const target = item.rawLoop ? items.findIndex((other) => other.origin === item.rawLoop!.to && other.origin >= 0) : -1;
    const loop =
      item.rawLoop && loopTargets(plan, i).includes(target)
        ? { ...item.rawLoop, to: target }
        : item.step.kind === 'review'
          ? reviewLoop(plan)
          : null;
    return { ...item.step, loop };
  });
}

export function planProgress(task: Task) {
  return { done: task.plan.filter((s) => s.status === 'done').length, total: task.plan.length };
}

export function currentStepOf(task: Task): WorkflowStep | undefined {
  return task.plan.find((s) => s.id === task.currentStepId);
}

export function currentStepLabel(task: Task) {
  if (task.status === 'queued') return '대기';
  if (task.status === 'completed') return '완료';
  return currentStepOf(task)?.label ?? task.plan[0]?.label ?? '';
}

export const PLAN_MODE_LABEL = { template: '유형 기본', ai: 'AI 설계', custom: '직접 설계' } as const;
