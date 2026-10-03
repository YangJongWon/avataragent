import { ApplicationFailure } from '@temporalio/common';
import type { WorkflowStep } from '../../shared/types.ts';
import { store } from '../store.ts';

export interface PlanStepRef {
  id: string;
  kind: WorkflowStep['kind'];
}

export interface RunStepInput {
  taskId: string;
  stepId: string;
  /** Reviewer or user feedback that sent the journey back to this step. */
  feedback: string | null;
  /** Present only on the retry after a help request: the user's answer, or null when it timed out. */
  helpAnswer?: string | null;
}

export type StepResult =
  | { kind: 'done' }
  | { kind: 'loop'; to: number; reason: string }
  | { kind: 'needs_help'; timeoutMs: number };

/**
 * Side effects of one task run. Each call must be idempotent per (taskId, stepId, attempt)
 * because Temporal retries activities and replays them after worker restarts.
 */
export interface TaskActivities {
  loadPlan(taskId: string): Promise<PlanStepRef[]>;
  runStep(input: RunStepInput): Promise<StepResult>;
  requestApproval(taskId: string, stepId: string): Promise<void>;
  recordChangeRequest(taskId: string, stepId: string, comment: string): Promise<void>;
  completeTask(taskId: string, valueKrw?: number): Promise<void>;
  failTask(taskId: string, reason: string): Promise<void>;
}

const notConnected = (name: string) =>
  ApplicationFailure.nonRetryable(`Temporal 활동 ${name}은(는) 아직 오케스트레이터 단계 실행과 연결되지 않았어요.`, 'NotImplemented');

/** `onSettled` runs after a task completes or fails so the runtime can start the next queued task. */
export function createTaskActivities(onSettled: () => void): TaskActivities {
  return {
    async loadPlan(taskId) {
      return store.task(taskId).plan.map((step) => ({ id: step.id, kind: step.kind }));
    },
    async runStep() {
      throw notConnected('runStep');
    },
    async requestApproval() {
      throw notConnected('requestApproval');
    },
    async recordChangeRequest() {
      throw notConnected('recordChangeRequest');
    },
    async completeTask() {
      throw notConnected('completeTask');
    },
    async failTask(taskId, reason) {
      if (store.task(taskId).status === 'failed') return;
      store.updateTask(taskId, (t) => {
        t.status = 'failed';
        t.failureReason = reason;
        t.help = null;
      });
      store.emit('task.failed', { taskId, payload: { reason } });
      onSettled();
    },
  };
}
