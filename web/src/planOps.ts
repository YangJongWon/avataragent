import type { Agent, StepKind, StepLoop, WorkflowStepInput } from '../../shared/types.ts';
import { LOOP_PLACEHOLDER, loopTargets, PARALLEL_KINDS, parallelGroup, remapLoops, reviewLoop, STEP_KIND, structureError } from '../../shared/workflow.ts';

/** Edits on a journey that keep its loops pointing at the same steps. `locked` leading steps never move. */

/** Every kind of step can be added; the approval only while the journey has none. */
export const ADDABLE: StepKind[] = ['brief', 'research', 'draft', 'review', 'approval'];

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
  if (steps[index].kind === 'review') return reviewLoop(steps, index);
  return { to: index, when: (LOOP_PLACEHOLDER[steps[index].kind] ?? '').replace(/^예:\s*/, ''), max: null };
}

/** A step may move past any neighbour, as long as the journey keeps its few rules (see structureError). */
export function canMove(steps: WorkflowStepInput[], index: number, delta: -1 | 1, locked = 0) {
  const other = index + delta;
  if (!steps[other] || index < locked || other < locked) return false;
  const next = [...steps];
  [next[index], next[other]] = [next[other], next[index]];
  return !structureError(next);
}

export function moveStep(steps: WorkflowStepInput[], index: number, delta: -1 | 1) {
  const other = index + delta;
  const next = remapLoops(steps, (i) => (i === index ? other : i === other ? index : i));
  [next[index], next[other]] = [next[other], next[index]];
  return clampLoops(next);
}

/** Any step may go while the journey still keeps its rules: an intake first and a draft before any review. */
export const canRemove = (steps: WorkflowStepInput[], index: number, locked = 0) =>
  index >= locked && index < steps.length && !structureError(steps.filter((_, i) => i !== index));

export function removeStep(steps: WorkflowStepInput[], index: number) {
  return clampLoops(remapLoops(steps, (i) => (i === index ? null : i > index ? i - 1 : i)).filter((_, j) => j !== index));
}

/**
 * Where a new step goes: right after the stage of `after` when given, otherwise research before the first draft and
 * anything else at the end (before the approval). Null when it cannot go there (inside the locked part, or a review
 * with no draft before it, or a second approval).
 */
export function insertIndex(steps: WorkflowStepInput[], kind: StepKind, after: number | null, locked = 0) {
  const approval = steps.findIndex((s) => s.kind === 'approval');
  if (kind === 'approval') return approval >= 0 ? null : steps.length;
  const end = approval >= 0 ? approval : steps.length;
  let at: number;
  if (after !== null) {
    at = after + 1;
    while (steps[at]?.parallel) at++;
  } else if (kind === 'research') {
    const draft = steps.findIndex((s) => s.kind === 'draft');
    at = draft >= 0 ? draft : end;
  } else {
    at = end;
  }
  at = Math.min(Math.max(at, locked, 1), end);
  const next = [...steps];
  next.splice(at, 0, { kind, label: '', agentId: null, instructions: '', loop: null });
  return structureError(next) ? null : at;
}

/** A new step of any kind at `at`, given to the first staff member of its role; a review loops back to its draft. */
export function insertStep(steps: WorkflowStepInput[], kind: StepKind, agents: Agent[], at: number, label: string) {
  const role = STEP_KIND[kind].role;
  const owner = role ? (agents.find((a) => a.role === role)?.id ?? agents[0]?.id ?? null) : null;
  const next = remapLoops(steps, (i) => (i >= at ? i + 1 : i));
  next.splice(at, 0, { kind, label, agentId: owner, instructions: '', loop: null });
  if (kind === 'review') next[at] = { ...next[at], loop: reviewLoop(next, at) };
  return clampLoops(next);
}

/**
 * Turns a step into another kind, where it stands when the journey still keeps its rules there, otherwise at the
 * nearest place the kind may go (a review after the draft, for one).
 */
export function changeKind(steps: WorkflowStepInput[], index: number, kind: StepKind, agents: Agent[], locked = 0) {
  const step = steps[index];
  if (!step || step.kind === kind || index < locked || step.kind === 'approval' || kind === 'approval') return { steps, index };
  const role = STEP_KIND[kind].role;
  const roleFits = agents.find((a) => a.id === step.agentId)?.role === role;
  const owner = roleFits ? step.agentId : (agents.find((a) => a.role === role)?.id ?? step.agentId);
  const { parallel: _, imageModel: __, ...rest } = step;
  const next = steps.map((s, i) => (i === index ? { ...rest, kind, agentId: owner, loop: null } : s));
  if (kind === 'review') next[index] = { ...next[index], loop: reviewLoop(next, index) };
  if (!structureError(next)) return { steps: tidyParallel(clampLoops(next)), index };
  const without = removeStep(steps, index);
  const at = insertIndex(without, kind, kind === 'research' ? null : without.findLastIndex((s) => s.kind === 'draft'), locked);
  if (at === null) return { steps, index };
  const moved = remapLoops(without, (i) => (i >= at ? i + 1 : i));
  moved.splice(at, 0, { ...rest, kind, agentId: owner, loop: null });
  if (kind === 'review') moved[at] = { ...moved[at], loop: reviewLoop(moved, at) };
  return structureError(moved) ? { steps, index } : { steps: tidyParallel(clampLoops(moved)), index: at };
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
export function tidyParallel(steps: WorkflowStepInput[]) {
  const next: WorkflowStepInput[] = steps.map((s, i) => {
    if (!s.parallel || (PARALLEL_KINDS.includes(s.kind) && steps[i - 1]?.kind === s.kind)) return s;
    const { parallel: _, ...rest } = s;
    return rest;
  });
  return clampLoops(
    next.map((s, i) => {
      const loopless = s.kind !== 'review' && (s.parallel || next[i + 1]?.parallel);
      return s.loop && (s.parallel || loopless) ? { ...s, loop: null } : s;
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

/** The journey as stages: each a list of step indexes, more than one when its steps run at the same time. */
export function stagesOf(steps: WorkflowStepInput[]) {
  const stages: number[][] = [];
  steps.forEach((s, i) => (i > 0 && s.parallel ? stages.at(-1)!.push(i) : stages.push([i])));
  return stages;
}

/** Adds a step to the stage of step `index`, run by a staff member of that role not already in it when there is one. */
export function addToStage(steps: WorkflowStepInput[], index: number, agents: Agent[], label: string) {
  const start = groupStart(steps, index);
  const kind = steps[start].kind;
  if (!PARALLEL_KINDS.includes(kind)) return steps;
  const at = start + parallelGroup(steps, start).length;
  const used = new Set(steps.slice(start, at).map((s) => s.agentId));
  const role = STEP_KIND[kind].role;
  const owner = agents.find((a) => a.role === role && !used.has(a.id)) ?? agents.find((a) => a.role === role) ?? agents[0];
  const next = remapLoops(steps, (i) => (i >= at ? i + 1 : i));
  next.splice(at, 0, { kind, label, agentId: owner?.id ?? null, instructions: '', loop: null, parallel: true });
  return tidyParallel(next);
}

/** Removes a step from its stage; when it led the stage, the next one takes its place and its loop. */
export function removeFromStage(steps: WorkflowStepInput[], index: number) {
  const leads = !steps[index].parallel && steps[index + 1]?.parallel;
  const next = leads
    ? steps.map((s, i) => {
        if (i !== index + 1) return s;
        const { parallel: _, ...rest } = s;
        return { ...rest, loop: steps[index].loop ?? null };
      })
    : steps;
  return tidyParallel(removeStep(next, index));
}

/** Takes a step out of its stage: it runs on its own right after the stage. */
export function separateFromStage(steps: WorkflowStepInput[], index: number) {
  return rewire(steps, groupStart(steps, index), index)?.steps ?? steps;
}

/**
 * Puts step `index` at stage number `stage` (0-based, as numbered now). A stage of the same kind that can run several
 * at once takes it in, to run at the same time; any other number puts the step there on its own, so it becomes that
 * stage and the later ones move one along. One past the last puts it at the end, before the approval. Null when the
 * journey would break its rules (see structureError).
 */
export function setStage(steps: WorkflowStepInput[], index: number, stage: number) {
  const before = stagesOf(steps);
  const from = before.findIndex((group) => group.includes(index));
  if (stage === from) return steps;
  const step = steps[index];
  const target = before[stage];
  const joins = Boolean(target) && steps[target[0]].kind === step.kind && PARALLEL_KINDS.includes(step.kind);
  const rest = removeFromStage(steps, index);
  const stages = stagesOf(rest);
  // Only one step went, so every later index moved up by one.
  const shift = (i: number) => (i > index ? i - 1 : i);
  let at: number;
  if (joins) {
    at = stages.find((group) => group.includes(shift(target![0])))!.at(-1)! + 1;
  } else if (target) {
    at = stages.find((group) => group.includes(shift(target[0])))![0];
    // Moving down, the step lands after the stage it was numbered as, taking that number itself.
    if (stage > from) at = (stages.find((group) => group.includes(shift(target.at(-1)!)))!.at(-1) ?? at) + 1;
  } else {
    at = rest.at(-1)?.kind === 'approval' && step.kind !== 'approval' ? rest.length - 1 : rest.length;
  }
  const { parallel: _, ...alone } = step;
  const next = remapLoops(rest, (i) => (i >= at ? i + 1 : i));
  next.splice(at, 0, joins ? { ...alone, parallel: true, loop: null } : { ...alone, loop: step.loop && step.loop.to < at ? step.loop : null });
  const tidy = tidyParallel(next);
  return structureError(tidy) ? null : tidy;
}
