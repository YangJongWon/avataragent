// Runs inside the Temporal workflow sandbox: only deterministic code and type-only app imports.
import { condition, defineQuery, defineSignal, proxyActivities, setHandler } from '@temporalio/workflow';
import type { StepResult, TaskActivities } from './activities.ts';

export interface TaskWorkflowInput {
  taskId: string;
}

export type ApprovalDecision = { kind: 'approve'; valueKrw?: number } | { kind: 'changes'; comment: string };

export const helpAnsweredSignal = defineSignal<[string | null]>('helpAnswered');
export const approvalDecidedSignal = defineSignal<[ApprovalDecision]>('approvalDecided');
export const currentStepQuery = defineQuery<string | null>('currentStep');

const MAX_STEP_RUNS = 40;

const activities = proxyActivities<TaskActivities>({
  startToCloseTimeout: '10 minutes',
  heartbeatTimeout: '1 minute',
  retry: { maximumAttempts: 3, initialInterval: '2 seconds', backoffCoefficient: 2 },
});

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
    const plan = await activities.loadPlan(taskId);
    const draftIndex = plan.findIndex((step) => step.kind === 'draft');
    let at = 0;
    let runs = 0;
    let feedback: string | null = null;
    let answer: string | null | undefined;

    for (;;) {
      if (++runs > MAX_STEP_RUNS) throw new Error('업무 여정이 너무 많이 반복돼서 멈췄어요. 루프 조건을 확인해 주세요.');
      const step = plan[at];
      currentStepId = step.id;

      if (step.kind === 'approval') {
        decision = undefined;
        await activities.requestApproval(taskId, step.id);
        await condition(() => decision !== undefined);
        const decided = decision!;
        if (decided.kind === 'changes') {
          await activities.recordChangeRequest(taskId, step.id, decided.comment);
          feedback = decided.comment;
          at = draftIndex;
          continue;
        }
        await activities.completeTask(taskId, decided.valueKrw);
        return;
      }

      const result: StepResult = await activities.runStep({ taskId, stepId: step.id, feedback, helpAnswer: answer });
      feedback = null;
      answer = undefined;
      if (result.kind === 'needs_help') {
        helpAnswer = undefined;
        const answered = await condition(() => helpAnswer !== undefined, result.timeoutMs);
        answer = answered ? helpAnswer! : null;
        continue;
      }
      if (result.kind === 'loop') {
        feedback = result.reason;
        at = result.to;
        continue;
      }
      at += 1;
    }
  } catch (error) {
    await activities.failTask(taskId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}
