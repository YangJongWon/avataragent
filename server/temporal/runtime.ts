import { fileURLToPath } from 'node:url';
import { Client, Connection } from '@temporalio/client';
import { config } from '../config.ts';
import {
  AUTO_RUN_DESCRIPTION,
  autoRunOffices,
  cancelTask,
  drainQueues,
  recordTask,
  setPaused,
  updatePlan,
} from '../orchestrator.ts';
import { store } from '../store.ts';
import type { WorkflowRuntime } from '../workflow-runtime.ts';
import { createTaskActivities } from './activities.ts';
import { approvalDecidedSignal, helpAnsweredSignal, taskWorkflow, type ApprovalDecision } from './workflows.ts';

const workflowIdOf = (taskId: string) => `task-${taskId}`;

function expectStatus(taskId: string, status: 'awaiting_help' | 'awaiting_approval') {
  if (store.task(taskId).status === status) return;
  throw new Error(status === 'awaiting_help' ? '도움을 기다리는 업무가 아닙니다.' : '승인을 기다리는 업무가 아닙니다.');
}

/**
 * Durable runtime: one Temporal workflow per started task, user decisions as signals.
 * The worker runs inside the API process because activities share the in-memory store
 * and its SQLite file; it can move out once the store is transactional (ADR-002).
 */
export function createTemporalRuntime(): WorkflowRuntime {
  const { address, namespace, taskQueue } = config.temporal;
  const client = new Client({ connection: Connection.lazy({ address }), namespace });
  let worker: Promise<void> | null = null;

  async function startWorkflow(taskId: string) {
    try {
      await client.workflow.start(taskWorkflow, { taskQueue, workflowId: workflowIdOf(taskId), args: [{ taskId }] });
    } catch (error) {
      const reason = `Temporal 실행을 시작하지 못했어요: ${error instanceof Error ? error.message : String(error)}`;
      store.updateTask(taskId, (t) => {
        t.status = 'failed';
        t.failureReason = reason;
      });
      store.emit('task.failed', { taskId, payload: { reason } });
    }
  }

  async function drain() {
    const starting: Promise<void>[] = [];
    drainQueues((taskId) => starting.push(startWorkflow(taskId)));
    await Promise.all(starting);
  }

  async function signal(taskId: string, decision: ApprovalDecision) {
    expectStatus(taskId, 'awaiting_approval');
    await client.workflow.getHandle(workflowIdOf(taskId)).signal(approvalDecidedSignal, decision);
  }

  async function runWorker() {
    const { NativeConnection, Worker } = await import('@temporalio/worker');
    const connection = await NativeConnection.connect({ address });
    const instance = await Worker.create({
      connection,
      namespace,
      taskQueue,
      workflowsPath: fileURLToPath(new URL('./workflows.ts', import.meta.url)),
      activities: createTaskActivities(() => void drain()),
    });
    await instance.run();
  }

  return {
    async createTask(input) {
      const task = recordTask(input);
      await drain();
      return store.task(task.id);
    },
    async designPlan() {
      throw new Error('Temporal 런타임의 AI 여정 설계는 아직 연결되지 않았어요.');
    },
    updatePlan: async (taskId, steps) => updatePlan(taskId, steps),
    cancelTask: async (taskId) => cancelTask(taskId),
    async answerHelp(taskId, answer) {
      expectStatus(taskId, 'awaiting_help');
      await client.workflow.getHandle(workflowIdOf(taskId)).signal(helpAnsweredSignal, answer);
    },
    approve: (taskId, valueKrw) => signal(taskId, { kind: 'approve', valueKrw }),
    async requestChanges(taskId, comment) {
      if (!comment.trim()) throw new Error('수정 요청 내용을 입력해 주세요.');
      await signal(taskId, { kind: 'changes', comment: comment.trim() });
    },
    pauseAgent: async (agentId, paused) => setPaused(agentId, paused),
    async tick() {
      for (const office of autoRunOffices()) recordTask({ officeId: office.id, description: AUTO_RUN_DESCRIPTION });
      await drain();
    },
    async start() {
      worker ??= runWorker().catch((error) => {
        worker = null;
        console.error('[temporal] 워커가 멈췄어요:', error);
      });
    },
    drain,
  };
}
