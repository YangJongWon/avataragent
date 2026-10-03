import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-temporal-'));
process.env.AI_PROVIDER = 'mock';
process.env.MOCK_DELAY_MS = '5';
process.env.HELP_TIMEOUT_SEC = '600';

// Starts a throwaway Temporal dev server (the CLI binary is downloaded once and cached).
// Set SKIP_TEMPORAL_TESTS=1 where that download is not possible.
if (process.env.SKIP_TEMPORAL_TESTS === '1') {
  test('temporal: WorkflowRuntime 계약', { skip: 'SKIP_TEMPORAL_TESTS=1' }, () => {});
} else {
  const { TestWorkflowEnvironment } = await import('@temporalio/testing');
  const externalAddress = process.env.TEMPORAL_TEST_ADDRESS?.trim();
  const env = externalAddress ? null : await TestWorkflowEnvironment.createLocal();
  const { store } = await import('../server/store.ts');
  const { claimTask, recordTask } = await import('../server/orchestrator.ts');
  const { createTemporalRuntime } = await import('../server/temporal/runtime.ts');
  const { runtimeContract, until } = await import('./runtime-contract.ts');
  const runtime = createTemporalRuntime({
    address: externalAddress || env!.address,
    namespace: process.env.TEMPORAL_TEST_NAMESPACE || env?.namespace || 'default',
    taskQueue: `contract-test-${process.pid}`,
  });

  // A task the local runtime had started before the switch: running in the store, no workflow yet.
  const stranded = recordTask({ officeId: 'office_mgmt', title: '이전 실행기 업무' });
  claimTask(stranded.id);

  runtimeContract('temporal', runtime, async () => {});

  test('temporal: 로컬 실행기가 남긴 진행 중 업무를 이어받는다', async (t) => {
    t.after(async () => {
      await runtime.stop();
      await env?.teardown();
    });
    await until(() => store.task(stranded.id).status === 'awaiting_approval', '이어받은 업무 승인 대기');
    await runtime.approve(stranded.id);
    await until(() => store.task(stranded.id).status === 'completed', '이어받은 업무 완료');
  });
}
