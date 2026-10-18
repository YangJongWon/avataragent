import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-retry-'));
process.env.AI_PROVIDER = 'mock';
process.env.MOCK_DELAY_MS = '5';

const { store } = await import('../server/store.ts');
const { localWorkflowRuntime: runtime } = await import('../server/workflow-runtime.ts');
const { until } = await import('./runtime-contract.ts');

test('a stopped task continues from the step that failed, keeping the finished ones', async () => {
  // Real AI without a key stops the task at its first AI step.
  store.mutate((s) => {
    s.aiMode = 'agents';
  });
  for (const agent of store.data.agents.filter((a) => a.officeId === 'office_welfare')) store.updateAgent(agent.id, { model: 'claude-sonnet' });
  const task = await runtime.createTask({ officeId: 'office_welfare', title: '이어서 하기', description: '테스트' });
  await until(() => store.task(task.id).status === 'failed', '중단');
  assert.match(store.task(task.id).failureReason ?? '', /API 키/);
  const failedAt = store.task(task.id).plan.findIndex((s) => s.status === 'error');
  assert.ok(failedAt >= 0);

  store.mutate((s) => {
    s.aiMode = 'mock';
  });
  await runtime.retryTask(task.id);
  assert.equal(store.task(task.id).failureReason, null);
  await until(() => store.task(task.id).status === 'awaiting_approval', '이어서 승인 대기');
  assert.ok(store.task(task.id).plan.every((s) => s.status !== 'error'));

  await assert.rejects(runtime.retryTask(task.id), /중단된 업무만/);
  await runtime.approve(task.id);
  await until(() => store.task(task.id).status === 'completed', '완료');
});
