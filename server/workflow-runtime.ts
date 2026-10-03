import type { Task } from '../shared/types.ts';
import {
  answerHelp,
  approve,
  cancelTask,
  createTask,
  designPlan,
  drainQueues,
  requestChanges,
  resumeActiveTasks,
  updatePlan,
} from './orchestrator.ts';

export interface WorkflowRuntime {
  createTask(input: Parameters<typeof createTask>[0]): Task;
  designPlan(input: Parameters<typeof designPlan>[0]): ReturnType<typeof designPlan>;
  updatePlan(taskId: string, steps: unknown): Task;
  cancelTask(taskId: string): void;
  answerHelp(taskId: string, answer: string | null): void;
  approve(taskId: string, valueKrw?: number): void;
  requestChanges(taskId: string, comment: string): void;
  start(): void;
  drain(): void;
}

/**
 * Migration runtime backed by the original in-process orchestrator.
 * HTTP/UI code depends only on WorkflowRuntime so Temporal can replace this
 * implementation without changing the product-facing API.
 */
export const localWorkflowRuntime: WorkflowRuntime = {
  createTask,
  designPlan,
  updatePlan,
  cancelTask,
  answerHelp,
  approve,
  requestChanges,
  start: resumeActiveTasks,
  drain: drainQueues,
};

// TemporalRuntime will become the production default after the worker,
// signal mapping and legacy-run migration are in place.
export const workflowRuntime = localWorkflowRuntime;
