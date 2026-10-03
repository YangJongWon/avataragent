// Shared WorkflowRuntime contract. Import only after DATA_DIR / AI_PROVIDER are set: the store loads on import.
import assert from 'node:assert/strict';
import test from 'node:test';
import { simulateMail } from '../server/orchestrator.ts';
import { store } from '../server/store.ts';
import { toStepInputs, type WorkflowRuntime } from '../server/workflow-runtime.ts';

type Task = ReturnType<typeof store.task>;

export async function until(check: () => boolean, label: string, timeoutMs = 30_000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error(`시간 초과: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const statusOf = (taskId: string): Task['status'] => store.task(taskId).status;

export function runtimeContract(name: string, runtime: WorkflowRuntime, teardown: () => Promise<void> = () => runtime.stop()) {
  test(`${name}: WorkflowRuntime 계약`, async (t) => {
    t.after(teardown);
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
      assert.deepEqual(store.task(running.id).clarifications, ['비용·효과 중심']);

      await assert.rejects(runtime.requestChanges(running.id, '  '), /수정 요청 내용/);
      await runtime.requestChanges(running.id, '결론을 먼저 써 주세요.');
      await until(() => statusOf(running.id) === 'awaiting_approval' && store.task(running.id).userChangeRequests.length === 1, '재승인 대기');

      await runtime.approve(running.id, 10_000);
      await until(() => statusOf(running.id) === 'completed', '완료');
      assert.equal(store.task(running.id).value?.recognizedKrw, 10_000);
    });

    await t.test('AI 여정 설계로 만든 업무도 끝까지 실행된다', async () => {
      const preview = await runtime.designPlan({ officeId: 'office_welfare', title: '추천', description: '간단히', taskType: '' });
      assert.equal(preview.steps.at(-1)?.kind, 'approval');
      const task = await runtime.createTask({ officeId: 'office_welfare', title: 'AI 설계', description: '간단히', planMode: 'ai' });
      await until(() => statusOf(task.id) === 'awaiting_approval', 'AI 설계 업무 승인 대기');
      assert.ok(store.task(task.id).planNote);
      await runtime.approve(task.id);
      await until(() => statusOf(task.id) === 'completed', 'AI 설계 업무 완료');
    });

    await t.test('일시정지한 직원은 다시 깨울 때까지 단계를 시작하지 않는다', async () => {
      const agents = store.data.agents.filter((a) => a.officeId === 'office_welfare');
      for (const agent of agents) await runtime.pauseAgent(agent.id, true);
      assert.equal(store.agent(agents[0].id).status, 'paused');
      const task = await runtime.createTask({ officeId: 'office_welfare', title: '일시정지', description: '테스트' });
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(store.task(task.id).artifacts.length, 0);
      for (const agent of agents) await runtime.pauseAgent(agent.id, false);
      await until(() => statusOf(task.id) === 'awaiting_approval', '재개 후 승인 대기');
      await runtime.approve(task.id);
      await until(() => statusOf(task.id) === 'completed', '재개 업무 완료');
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
