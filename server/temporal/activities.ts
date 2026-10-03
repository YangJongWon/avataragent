import { Context } from '@temporalio/activity';
import { ApplicationFailure } from '@temporalio/common';
import {
  applyChangeRequest,
  clarifyWith,
  completeTask,
  failTask,
  prepareRun,
  requestApproval,
  runStepAt,
  type RunPoint,
  type StepOutcome,
} from '../orchestrator.ts';

export interface RunStepInput {
  taskId: string;
  at: number;
  /** Reviewer feedback or loop reason that sent the journey back to this step. */
  feedback: string | null;
  /** Present only on the re-run after a help request: the user's answer, or null when it timed out. */
  helpAnswer?: string | null;
}

/**
 * Side effects of one task run, backed by the same step functions as the local runtime.
 * Temporal may retry or replay these after a worker restart, so each must tolerate a repeat.
 */
export interface TaskActivities {
  prepareRun(taskId: string): Promise<RunPoint>;
  runStep(input: RunStepInput): Promise<StepOutcome>;
  requestApproval(taskId: string, stepId: string): Promise<void>;
  applyChangeRequest(taskId: string, stepId: string, comment: string): Promise<number>;
  completeTask(taskId: string, valueKrw?: number): Promise<void>;
  failTask(taskId: string, reason: string): Promise<void>;
}

const HEARTBEAT_MS = 5_000;

/**
 * Heartbeats while the step runs (AI calls, paused agents) and turns step errors into
 * non-retryable failures: the AI layer already retries transient errors, and errors such as
 * an exhausted budget would only fail again. Worker crashes and timeouts are still retried.
 */
async function step<T>(job: () => Promise<T> | T): Promise<T> {
  const context = Context.current();
  const timer = setInterval(() => context.heartbeat(), HEARTBEAT_MS);
  try {
    return await job();
  } catch (error) {
    throw ApplicationFailure.nonRetryable(error instanceof Error ? error.message : String(error), 'TaskStepFailed');
  } finally {
    clearInterval(timer);
  }
}

/** `onSettled` runs after a task completes or fails so the runtime can start the next queued task. */
export function createTaskActivities(onSettled: () => void): TaskActivities {
  return {
    prepareRun: (taskId) => step(() => prepareRun(taskId)),
    runStep: ({ taskId, at, feedback, helpAnswer }) => step(() => runStepAt(taskId, at, feedback, clarifyWith(helpAnswer))),
    requestApproval: (taskId, stepId) => step(() => requestApproval(taskId, stepId)),
    applyChangeRequest: (taskId, stepId, comment) => step(() => applyChangeRequest(taskId, stepId, comment)),
    completeTask: (taskId, valueKrw) =>
      step(() => {
        completeTask(taskId, valueKrw);
        onSettled();
      }),
    failTask: (taskId, reason) =>
      step(() => {
        failTask(taskId, reason);
        onSettled();
      }),
  };
}
