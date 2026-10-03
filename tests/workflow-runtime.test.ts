import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-runtime-'));
process.env.AI_PROVIDER = 'mock';
process.env.MOCK_DELAY_MS = '5';
process.env.HELP_TIMEOUT_SEC = '600';

const { store } = await import('../server/store.ts');
const { simulateMail } = await import('../server/orchestrator.ts');
const { localWorkflowRuntime, toStepInputs } = await import('../server/workflow-runtime.ts');
type WorkflowRuntime = typeof localWorkflowRuntime;
type Task = ReturnType<typeof store.task>;

async function until(check: () => boolean, label: string, timeoutMs = 10_000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error(`시간 초과: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const statusOf = (taskId: string): Task['status'] => store.task(taskId).status;

function contract(name: string, runtime: WorkflowRuntime) {
  test(`${name}: WorkflowRuntime 계약`, async (t) => {
    await runtime.start();
    await runtime.drain();

    let running: Task;
    let queued: Task;

    await t.test('첫 업무는 바로 실행되고 다음 업무는 대기한다', async () => {
      running = await runtime.createTask({ officeId: 'office_dev', title: '첫 업무', description: '테스트' });
      queued = await runtime.createTask({ officeId: 'office_dev', title: '두 번째 업무', description: '테스트' });
      assert.notEqual(running.status, 'queued');
      assert.equal(queued.status, 'queued');
    });

    await t.test('잘못된 요청은 Promise 거부로 알린다', async () => {
      await assert.rejects(runtime.cancelTask(running.id), /대기 중인 업무만/);
      await assert.rejects(runtime.updatePlan(running.id, []), /대기 중인 업무의 여정만/);
      await assert.rejects(runtime.approve(queued.id), /승인을 기다리는/);
      await assert.rejects(runtime.requestChanges(queued.id, '고쳐 주세요'), /승인을 기다리는/);
      await assert.rejects(runtime.answerHelp(queued.id, null), /도움을 기다리는/);
      assert.throws(() => toStepInputs('steps'), /형식이 올바르지/);
      assert.throws(() => toStepInputs([1]), /형식이 올바르지/);
    });

    await t.test('대기 업무의 여정을 바꾸고 규칙 위반은 거절한다', async () => {
      const steps = toStepInputs(queued.plan.map(({ kind, label, agentId, instructions, loop }) => ({ kind, label, agentId, instructions, loop })));
      const short = steps.filter((s) => ['brief', 'draft', 'approval'].includes(s.kind)).map((s) => ({ ...s, loop: null }));
      const updated = await runtime.updatePlan(queued.id, short);
      assert.equal(updated.planMode, 'custom');
      assert.deepEqual(updated.plan.map((s) => s.kind), ['brief', 'draft', 'approval']);
      await assert.rejects(runtime.updatePlan(queued.id, short.slice(1)));
    });

    await t.test('대기 업무를 취소한다', async () => {
      await runtime.cancelTask(queued.id);
      assert.equal(store.data.tasks.some((task) => task.id === queued.id), false);
    });

    await t.test('도움 요청에 답하고 수정 요청 뒤 승인하면 완료된다', async () => {
      await until(() => statusOf(running.id) === 'awaiting_help', '도움 요청');
      await runtime.answerHelp(running.id, '비용·효과 중심');
      await until(() => statusOf(running.id) === 'awaiting_approval', '첫 승인 대기');

      await assert.rejects(runtime.requestChanges(running.id, '  '), /수정 요청 내용/);
      await runtime.requestChanges(running.id, '결론을 먼저 써 주세요.');
      await until(() => statusOf(running.id) === 'awaiting_approval' && store.task(running.id).userChangeRequests.length === 1, '재승인 대기');

      await runtime.approve(running.id, 10_000);
      await until(() => statusOf(running.id) === 'completed', '완료');
      assert.equal(store.task(running.id).value?.recognizedKrw, 10_000);
    });

    await t.test('직원을 일시정지하고 다시 깨운다', async () => {
      const agent = store.data.agents.find((a) => a.officeId === 'office_dev')!;
      await runtime.pauseAgent(agent.id, true);
      assert.equal(store.agent(agent.id).paused, true);
      assert.equal(store.agent(agent.id).status, 'paused');
      await runtime.pauseAgent(agent.id, false);
      assert.equal(store.agent(agent.id).paused, false);
    });

    await t.test('tick은 자동 확인 사무실에만 업무를 만든다', async () => {
      simulateMail();
      const hrTasks = () => store.data.tasks.filter((task) => task.officeId === 'office_hr').length;
      await runtime.tick();
      assert.equal(hrTasks(), 0);

      store.updateOffice('office_hr', (office) => {
        office.autoRun = true;
      });
      await runtime.tick();
      assert.equal(hrTasks(), 1);
      await runtime.tick();
      assert.equal(hrTasks(), 1);
    });
  });
}

contract('local', localWorkflowRuntime);
