import type { PlanMode, Task, WorkflowStepInput } from '../shared/types.ts';
import { config } from './config.ts';
import {
  answerHelp,
  approve,
  autoRunTick,
  cancelTask,
  createTask,
  designPlan,
  drainQueues,
  requestChanges,
  resumeActiveTasks,
  setPaused,
  updatePlan,
} from './orchestrator.ts';

export interface CreateTaskInput {
  officeId: string;
  title?: string;
  description?: string;
  taskType?: string;
  planMode?: PlanMode;
  steps?: WorkflowStepInput[];
  planNote?: string;
}

export interface PlanDraftInput {
  officeId: string;
  title: string;
  description: string;
  taskType: string;
}

export interface PlanDraft {
  steps: WorkflowStepInput[];
  note: string;
}

/**
 * Everything the API may ask of task execution. Every call is async so a durable
 * engine (Temporal: workflow start, signals, schedules) can implement it as-is.
 */
export interface WorkflowRuntime {
  createTask(input: CreateTaskInput): Promise<Task>;
  designPlan(input: PlanDraftInput): Promise<PlanDraft>;
  updatePlan(taskId: string, steps: WorkflowStepInput[]): Promise<Task>;
  cancelTask(taskId: string): Promise<void>;
  answerHelp(taskId: string, answer: string | null): Promise<void>;
  approve(taskId: string, valueKrw?: number): Promise<void>;
  requestChanges(taskId: string, comment: string): Promise<void>;
  pauseAgent(agentId: string, paused: boolean): Promise<void>;
  /** Starts tasks that offices with auto-run should pick up now. */
  tick(): Promise<void>;
  /** Resumes interrupted tasks after a restart. */
  start(): Promise<void>;
  /** Starts the next queued task in every idle office. */
  drain(): Promise<void>;
  /** Releases workers and connections; running tasks resume on the next start(). */
  stop(): Promise<void>;
}

/** Shape check for request bodies; plan rules (order, agents, loops) are enforced by the runtime. */
export function toStepInputs(raw: unknown): WorkflowStepInput[] {
  if (!Array.isArray(raw) || raw.some((s) => typeof s !== 'object' || s === null)) {
    throw new Error('업무 여정 형식이 올바르지 않아요.');
  }
  return raw as WorkflowStepInput[];
}

/** Migration runtime backed by the original in-process orchestrator. */
export const localWorkflowRuntime: WorkflowRuntime = {
  createTask: async (input) => createTask(input),
  designPlan: (input) => designPlan(input),
  updatePlan: async (taskId, steps) => updatePlan(taskId, steps),
  cancelTask: async (taskId) => cancelTask(taskId),
  answerHelp: async (taskId, answer) => answerHelp(taskId, answer),
  approve: async (taskId, valueKrw) => approve(taskId, valueKrw),
  requestChanges: async (taskId, comment) => requestChanges(taskId, comment),
  pauseAgent: async (agentId, paused) => setPaused(agentId, paused),
  tick: async () => autoRunTick(),
  start: async () => resumeActiveTasks(),
  drain: async () => drainQueues(),
  stop: async () => {},
};

// TemporalRuntime needs a Temporal Service (see OPERATIONS.md), so local stays the default.
export const workflowRuntime: WorkflowRuntime =
  config.workflowRuntime === 'temporal' ? (await import('./temporal/runtime.ts')).createTemporalRuntime() : localWorkflowRuntime;
