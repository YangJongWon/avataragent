// Runs inside the Temporal workflow sandbox: only deterministic code and type-only app imports.
import { condition, defineQuery, defineSignal, proxyActivities, setHandler } from '@temporalio/workflow';
import type { StepOutcome } from '../orchestrator.ts';
import type { TaskActivities } from './activities.ts';

export interface TaskWorkflowInput {
  taskId: string;
}

export type ApprovalDecision = { kind: 'approve'; valueKrw?: number } | { kind: 'changes'; comment: string };

export const helpAnsweredSignal = defineSignal<[string | null]>('helpAnswered');
export const approvalDecidedSignal = defineSignal<[ApprovalDecision]>('approvalDecided');
export const currentStepQuery = defineQuery<string | null>('currentStep');

const MAX_STEP_RUNS = 40;
const TOO_MANY_RUNS = '업무 여정이 너무 많이 반복돼서 멈췄어요. 루프 조건을 확인해 주세요.';

// A paused agent keeps its step open, so the close timeout is long and the heartbeat detects dead workers.
const activities = proxyActivities<TaskActivities>({
  startToCloseTimeout: '1 day',
  heartbeatTimeout: '1 minute',
  retry: { maximumAttempts: 3, initialInterval: '2 seconds', backoffCoefficient: 2 },
});

const reasonOf = (error: unknown) => {
  const cause = (error as { cause?: unknown })?.cause;
  if (cause instanceof Error) return cause.message;
  return error instanceof Error ? error.message : String(error);
};

export async function taskWorkflow({ taskId }: TaskWorkflowInput): Promise<void> {
  let helpAnswer: string | null | undefined;
  let decision: ApprovalDecision | undefined;
  let currentStepId: string | null = null;
  setHandler(helpAnsweredSignal, (answer) => {
    helpAnswer = answer;
  });
  setHandler(approvalDecidedSignal, (value) => {
    decision = value;
  });
  setHandler(currentStepQuery, () => currentStepId);

  try {
    const point = await activities.prepareRun(taskId);
    const steps = point.steps;
    let { at, runs } = point;
    let feedback: string | null = null;
    let answer: string | null | undefined;

    for (;;) {
      if (answer === undefined && ++runs > MAX_STEP_RUNS) throw new Error(TOO_MANY_RUNS);
      const step = steps[at];
      currentStepId = step.id;

      if (step.kind === 'approval') {
        decision = undefined;
        await activities.requestApproval(taskId, step.id);
        await condition(() => decision !== undefined);
        const decided = decision!;
        if (decided.kind === 'approve') {
          await activities.completeTask(taskId, decided.valueKrw);
          return;
        }
        at = await activities.applyChangeRequest(taskId, step.id, decided.comment);
        feedback = null;
        continue;
      }

      helpAnswer = undefined;
      const outcome: StepOutcome = await activities.runStep({ taskId, at, feedback, helpAnswer: answer });
      answer = undefined;
      if (outcome.kind === 'needs_help') {
        const answered = await condition(() => helpAnswer !== undefined, Math.max(1, outcome.timeoutMs));
        answer = answered ? helpAnswer! : null;
        continue;
      }
      ({ at, feedback } = outcome);
    }
  } catch (error) {
    await activities.failTask(taskId, reasonOf(error));
  }
}
