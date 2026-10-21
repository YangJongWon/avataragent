import { TEAMS } from './teams.ts';
import type { Agent, Role, StepKind, StepLoop, TeamId, WorkflowStepInput } from './types.ts';
import { MAX_PLAN_STEPS, parseLoop, STEP_KIND, validatePlan } from './workflow.ts';

export const FLOW_FORMAT = 'avataragent-flow';
const ROLES: Role[] = ['manager', 'researcher', 'writer', 'reviewer'];
const KINDS = Object.keys(STEP_KIND) as StepKind[];
export const FLOW_LIMITS = { label: 20, instructions: 300, name: 60, description: 500 };

/**
 * A shareable work journey: the steps of a plan with roles in place of agents, so it fits any office.
 * It never carries agent ids, task inputs or outputs.
 */
export interface FlowPack {
  format: typeof FLOW_FORMAT;
  version: 1;
  name: string;
  description: string;
  /** The team it was made in; any team may still use it. */
  team: TeamId | null;
  author: string;
  license: string;
  exportedAt: string;
  steps: FlowPackStep[];
}

export interface FlowPackStep {
  kind: StepKind;
  label: string;
  /** null only for the approval step, which belongs to the user. */
  role: Role | null;
  instructions: string;
  loop: StepLoop | null;
  /** Research only: runs at the same time as the research step before it. */
  parallel?: boolean;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** One stand-in agent per role, so validatePlan checks a flow without a real office. */
const roleAgents = ROLES.map((role) => ({ id: role, role }) as Agent);

/** Validates an untrusted flow file; unknown fields are dropped. Throws with a Korean message. */
export function parseFlowPack(input: unknown): FlowPack {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  if (raw.format !== FLOW_FORMAT) throw new Error('플로우 파일이 아니에요.');
  if (raw.version !== 1) throw new Error('이 버전의 플로우는 아직 읽을 수 없어요.');
  const license = str(raw.license, 80);
  if (!license) throw new Error('라이선스(license)를 적어 주세요.');
  const stepsIn = Array.isArray(raw.steps) ? raw.steps : [];
  if (stepsIn.length > MAX_PLAN_STEPS) throw new Error(`업무 여정은 ${MAX_PLAN_STEPS}단계까지 만들 수 있어요.`);
  const steps = stepsIn.map((item): FlowPackStep => {
    const s = (item ?? {}) as Record<string, unknown>;
    const kind = s.kind as StepKind;
    if (!KINDS.includes(kind)) throw new Error('알 수 없는 단계 종류가 있어요.');
    const role = kind === 'approval' ? null : ROLES.includes(s.role as Role) ? (s.role as Role) : STEP_KIND[kind].role;
    return { kind, label: str(s.label, FLOW_LIMITS.label), role, instructions: str(s.instructions, FLOW_LIMITS.instructions), loop: parseLoop(s.loop), ...(s.parallel === true ? { parallel: true } : {}) };
  });
  const error = validatePlan(
    steps.map((s) => ({ kind: s.kind, label: s.label, agentId: s.role, instructions: s.instructions, loop: s.loop, parallel: s.parallel })),
    roleAgents,
  );
  if (error) throw new Error(error);
  return {
    format: FLOW_FORMAT,
    version: 1,
    name: str(raw.name, FLOW_LIMITS.name) || '이름 없는 플로우',
    description: str(raw.description, FLOW_LIMITS.description),
    team: typeof raw.team === 'string' && raw.team in TEAMS ? (raw.team as TeamId) : null,
    author: str(raw.author, 60),
    license,
    exportedAt: str(raw.exportedAt, 40),
    steps,
  };
}

/** Turns an office's plan into a flow file: each agent becomes its role. */
export function flowFromPlan(
  steps: WorkflowStepInput[],
  agents: Agent[],
  meta: { name: string; description?: string; team?: TeamId | null; author?: string; license?: string },
): FlowPack {
  const roleOf = (step: WorkflowStepInput) =>
    step.kind === 'approval' ? null : (agents.find((a) => a.id === step.agentId)?.role ?? STEP_KIND[step.kind].role);
  return parseFlowPack({
    format: FLOW_FORMAT,
    version: 1,
    name: meta.name,
    description: meta.description ?? '',
    team: meta.team ?? null,
    author: meta.author ?? '',
    license: meta.license || 'CC-BY-4.0',
    exportedAt: new Date().toISOString(),
    steps: steps.map((s) => ({ kind: s.kind, label: s.label, role: roleOf(s), instructions: s.instructions, loop: s.loop ?? null, ...(s.parallel ? { parallel: true } : {}) })),
  });
}

/** Fits a flow to an office: each role goes to that office's agent with the role, or its first agent. */
export function flowToSteps(flow: FlowPack, officeAgents: Agent[]): WorkflowStepInput[] {
  const agentFor = (role: Role | null) => (role ? (officeAgents.find((a) => a.role === role)?.id ?? officeAgents[0]?.id ?? null) : null);
  return flow.steps.map((s) => ({ kind: s.kind, label: s.label, agentId: agentFor(s.role), instructions: s.instructions, loop: s.loop, ...(s.parallel ? { parallel: true } : {}) }));
}
