import type { Agent, StepKind, StepLoop, WorkflowStepInput } from '../../shared/types.ts';
import { LOOP_PLACEHOLDER, loopTargets, PARALLEL_KINDS, parallelGroup, remapLoops, reviewLoop, STEP_KIND } from '../../shared/workflow.ts';

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
  return { to: index, when: (LOOP_PLACEHOLDER[steps[index].kind] ?? '').replace(/^예:\s*/, ''), max: null };
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

export const canRemove = (steps: WorkflowStepInput[], index: number, locked = 0) =>
  index >= locked && (REMOVABLE.includes(steps[index]?.kind) || (steps[index]?.kind === 'approval' && index === steps.length - 1));

export function removeStep(steps: WorkflowStepInput[], index: number) {
  return clampLoops(remapLoops(steps, (i) => (i === index ? null : i > index ? i - 1 : i)).filter((_, j) => j !== index));
}

/**
 * Where a new research or review step may go: research sits before the draft, review after it and
 * before the approval. Prefers right after `after` when that is allowed, never inside the locked part.
 */
export function insertIndex(steps: WorkflowStepInput[], kind: 'research' | 'review', after: number | null, locked = 0) {
  const draft = steps.findIndex((s) => s.kind === 'draft');
  const approval = steps.findIndex((s) => s.kind === 'approval');
  const [min, max] = kind === 'research' ? [1, draft] : [draft + 1, approval >= 0 ? approval : steps.length];
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

/** Moves a step to index `at` of the list without it, keeping every loop on the same steps. */
function moveTo(steps: WorkflowStepInput[], from: number, at: number) {
  const order = steps.map((_, i) => i).filter((i) => i !== from);
  order.splice(at, 0, from);
  const next = remapLoops(steps, (i) => order.indexOf(i));
  return order.map((i) => next[i]);
}

/** The first step of the group of steps running together that `index` belongs to. */
function groupStart(steps: WorkflowStepInput[], index: number) {
  let i = index;
  while (i > 0 && steps[i].parallel) i--;
  return i;
}

/** Drops "at the same time" where it can no longer run, and loops a group may not carry. */
function tidyParallel(steps: WorkflowStepInput[]) {
  const next: WorkflowStepInput[] = steps.map((s, i) => {
    if (!s.parallel || (PARALLEL_KINDS.includes(s.kind) && steps[i - 1]?.kind === s.kind)) return s;
    const { parallel: _, ...rest } = s;
    return rest;
  });
  return clampLoops(
    next.map((s, i) => {
      const researchGroup = s.kind === 'research' && (s.parallel || next[i + 1]?.parallel);
      return s.loop && (s.parallel || researchGroup) ? { ...s, loop: null } : s;
    }),
  );
}

/**
 * A line drawn on the journey from step `from` to step `to`. From the step before a research or review step to
 * another step of that kind: the two run at the same time. From a step to one already running alongside it: the
 * other one follows it instead. Anything else has no meaning (null), since the order of steps draws the lines.
 */
export function rewire(steps: WorkflowStepInput[], from: number, to: number, locked = 0) {
  const target = steps[to];
  if (!target || from === to || to < locked || !PARALLEL_KINDS.includes(target.kind)) return null;
  const start = groupStart(steps, to);
  if (target.parallel && from >= start && from < to) {
    const end = start + parallelGroup(steps, start).length - 1;
    const moved = moveTo(steps, to, end);
    const { parallel: _, ...alone } = moved[end];
    moved[end] = alone;
    return { steps: tidyParallel(moved), index: end };
  }
  if (steps[from + 1]?.kind !== target.kind) return null;
  const anchor = groupStart(steps, from + 1);
  const end = anchor + parallelGroup(steps, anchor).length - 1;
  if (anchor < locked || (to >= anchor && to <= end)) return null;
  const at = to > end ? end + 1 : end;
  const moved = moveTo(steps, to, at);
  moved[at] = { ...moved[at], parallel: true, loop: null };
  return { steps: tidyParallel(moved), index: at };
}
