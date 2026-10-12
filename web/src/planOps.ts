import type { Agent, StepKind, StepLoop, WorkflowStepInput } from '../../shared/types.ts';
import { LOOP_PLACEHOLDER, loopTargets, remapLoops, reviewLoop, STEP_KIND } from '../../shared/workflow.ts';

/** Edits on a journey that keep its loops pointing at the same steps. `locked` leading steps never move. */

export const REMOVABLE: StepKind[] = ['research', 'review'];

/** After a move, a loop may point past where it is allowed; pull it back to the nearest valid step. */
export function clampLoops(steps: WorkflowStepInput[]) {
  return steps.map((s, i) => {
    if (!s.loop) return s;
    const targets = loopTargets(steps, i);
    if (targets.includes(s.loop.to)) return s;
    return { ...s, loop: { ...s.loop, to: targets.at(-1) ?? i } };
  });
}

export function defaultLoop(steps: WorkflowStepInput[], index: number): StepLoop {
  if (steps[index].kind === 'review') return reviewLoop(steps);
  return { to: index, when: (LOOP_PLACEHOLDER[steps[index].kind] ?? '').replace(/^예:\s*/, ''), max: 1 };
}

export function canMove(steps: WorkflowStepInput[], index: number, delta: -1 | 1, locked = 0) {
  const other = steps[index + delta];
  return Boolean(other) && index >= locked && index + delta >= locked && other.kind === steps[index].kind;
}

export function moveStep(steps: WorkflowStepInput[], index: number, delta: -1 | 1) {
  const other = index + delta;
  const next = remapLoops(steps, (i) => (i === index ? other : i === other ? index : i));
  [next[index], next[other]] = [next[other], next[index]];
  return clampLoops(next);
}

export const canRemove = (steps: WorkflowStepInput[], index: number, locked = 0) => index >= locked && REMOVABLE.includes(steps[index]?.kind);

export function removeStep(steps: WorkflowStepInput[], index: number) {
  return clampLoops(remapLoops(steps, (i) => (i === index ? null : i > index ? i - 1 : i)).filter((_, j) => j !== index));
}

/**
 * Where a new research or review step may go: research sits before the draft, review after it and
 * before the approval. Prefers right after `after` when that is allowed, never inside the locked part.
 */
export function insertIndex(steps: WorkflowStepInput[], kind: 'research' | 'review', after: number | null, locked = 0) {
  const draft = steps.findIndex((s) => s.kind === 'draft');
  const [min, max] = kind === 'research' ? [1, draft] : [draft + 1, steps.length - 1];
  const lo = Math.max(min, locked);
  if (lo > max) return null;
  const wanted = after === null ? max : after + 1;
  return Math.min(max, Math.max(lo, wanted));
}

export function insertStep(steps: WorkflowStepInput[], kind: 'research' | 'review', agents: Agent[], at: number, label: string) {
  const owner = agents.find((a) => a.role === STEP_KIND[kind].role)?.id ?? agents[0]?.id ?? null;
  const next = remapLoops(steps, (i) => (i >= at ? i + 1 : i));
  next.splice(at, 0, { kind, label, agentId: owner, instructions: '', loop: null });
  if (kind === 'review') next[at] = { ...next[at], loop: reviewLoop(next) };
  return clampLoops(next);
}

/** Turns a research step into a review or back, moving it to the nearest place that kind may stand. */
export function changeKind(steps: WorkflowStepInput[], index: number, kind: 'research' | 'review', agents: Agent[], locked = 0) {
  const step = steps[index];
  if (step.kind === kind || !REMOVABLE.includes(step.kind)) return { steps, index };
  const without = removeStep(steps, index);
  const at = insertIndex(without, kind, kind === 'research' ? null : index - 1, locked);
  if (at === null) return { steps, index };
  const roleFits = agents.find((a) => a.id === step.agentId)?.role === STEP_KIND[kind].role;
  const owner = roleFits ? step.agentId : (agents.find((a) => a.role === STEP_KIND[kind].role)?.id ?? step.agentId);
  const next = remapLoops(without, (i) => (i >= at ? i + 1 : i));
  next.splice(at, 0, { ...step, kind, agentId: owner, loop: null });
  if (kind === 'review') next[at] = { ...next[at], loop: reviewLoop(next) };
  return { steps: clampLoops(next), index: at };
}
