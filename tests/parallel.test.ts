import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-parallel-'));
process.env.AI_PROVIDER = 'mock';
process.env.MOCK_DELAY_MS = '150';

const { store } = await import('../server/store.ts');
const { localWorkflowRuntime: runtime } = await import('../server/workflow-runtime.ts');
const { until } = await import('./runtime-contract.ts');
const { validatePlan } = await import('../shared/workflow.ts');

test('research steps marked parallel run at the same time in one office, and the draft gets all of them', async () => {
  const office = 'office_welfare';
  const hired = [store.hireAgent(office, 'researcher', '둘째 리서처'), store.hireAgent(office, 'researcher', '셋째 리서처')];
  const team = store.data.agents.filter((a) => a.officeId === office);
  const by = (role: string) => team.find((a) => a.role === role && !hired.some((h) => h.id === a.id))!;
  const steps = [
    { kind: 'brief' as const, label: '접수', agentId: by('manager').id, instructions: '', loop: null },
    { kind: 'research' as const, label: '조사 A', agentId: by('researcher').id, instructions: '', loop: null },
    { kind: 'research' as const, label: '조사 B', agentId: hired[0].id, instructions: '', loop: null, parallel: true },
    { kind: 'research' as const, label: '조사 C', agentId: hired[1].id, instructions: '', loop: null, parallel: true },
    { kind: 'draft' as const, label: '비교 정리', agentId: by('writer').id, instructions: '', loop: null },
    { kind: 'approval' as const, label: '승인', agentId: null, instructions: '', loop: null },
  ];
  assert.equal(validatePlan(steps, team), null);
  // Only research right after research can run with it, and not with a loop.
  assert.match(validatePlan(steps.map((s, i) => (i === 4 ? { ...s, parallel: true } : s)), team) ?? '', /동시에/);
  assert.match(validatePlan(steps.map((s, i) => (i === 2 ? { ...s, loop: { to: 1, when: 'x', max: 1 } } : s)), team) ?? '', /되돌리기/);

  const startSeq = store.data.seq ?? 0;
  const task = await runtime.createTask({ officeId: office, title: '동시 조사', description: '테스트', planMode: 'custom', steps });
  await until(() => store.task(task.id).status === 'awaiting_approval', '승인 대기');

  const t = store.task(task.id);
  assert.equal(t.artifacts.filter((a) => a.kind === 'research').length, 3, 'three notes, one per researcher');
  assert.deepEqual(new Set(t.artifacts.filter((a) => a.kind === 'research').map((a) => a.agentId)).size, 3);
  assert.ok(t.plan.every((s) => s.kind === 'approval' || s.status === 'done'));

  // All three started before any of them finished: they ran at the same time.
  const { recentEvents } = await import('../server/db.ts');
  const events = recentEvents(300).filter((e) => e.taskId === task.id && e.seq > startSeq);
  const firstDone = events.findIndex((e) => e.type === 'tool.completed');
  const startedBefore = events.slice(0, firstDone).filter((e) => e.type === 'tool.started').length;
  assert.equal(startedBefore, 3, 'every research step started before the first finished');
  await runtime.approve(task.id);
  await until(() => store.task(task.id).status === 'completed', '완료');
});

test('reviews marked parallel judge the same draft at once and the majority decides', async () => {
  const { majorityApproves, templatePlan } = await import('../shared/workflow.ts');
  assert.equal(majorityApproves([true, true, false]), true);
  assert.equal(majorityApproves([true, false]), false, 'a tie sends the draft back');
  assert.equal(majorityApproves([false, false, true]), false);

  const office = 'office_mgmt';
  const extra = store.hireAgent(office, 'reviewer', '둘째 검토자');
  const team = store.data.agents.filter((a) => a.officeId === office);
  const by = (role: string) => team.find((a) => a.role === role && a.id !== extra.id)!;
  const steps = [
    { kind: 'brief' as const, label: '접수', agentId: by('manager').id, instructions: '', loop: null },
    { kind: 'draft' as const, label: '작성', agentId: by('writer').id, instructions: '', loop: null },
    { kind: 'review' as const, label: '검토 1', agentId: by('reviewer').id, instructions: '', loop: { to: 1, when: '기준 미달', max: 1 } },
    { kind: 'review' as const, label: '검토 2', agentId: extra.id, instructions: '', loop: null, parallel: true },
    { kind: 'approval' as const, label: '승인', agentId: null, instructions: '', loop: null },
  ];
  assert.equal(validatePlan(steps, team), null, 'the group keeps its loop on the first review');
  assert.match(validatePlan(steps.map((s, i) => (i === 3 ? { ...s, loop: { to: 1, when: 'x', max: 1 } } : s)), team) ?? '', /되돌리기/);

  const startSeq = store.data.seq ?? 0;
  const task = await runtime.createTask({ officeId: office, title: '다수결 검토', description: '테스트', planMode: 'custom', steps });
  await until(() => store.task(task.id).status === 'awaiting_approval', '승인 대기');
  const { recentEvents } = await import('../server/db.ts');
  const events = recentEvents(300).filter((e) => e.taskId === task.id && e.seq > startSeq);
  const firstDone = events.findIndex((e) => e.type === 'review.completed' || e.type === 'review.approved' || e.type === 'review.rejected');
  assert.ok(events.slice(0, firstDone < 0 ? events.length : firstDone).filter((e) => e.type === 'review.started').length >= 2, 'both reviewers started before either finished');
  assert.ok(store.task(task.id).reviews.length >= 2, 'both reviewers left a verdict');
  await runtime.approve(task.id);
  await until(() => store.task(task.id).status === 'completed', '완료');

  // The code task type writes code through its own journey.
  const code = templatePlan('dev', 'code_write', store.data.agents.filter((a) => a.officeId === 'office_dev'));
  assert.deepEqual(code.map((s) => s.label), ['요구사항 접수', '구현 방법 조사', '코드 작성', '코드 검토', '사용자 승인']);
});

test('drafts marked parallel are written at the same time, and the next reviewer keeps the best one', async () => {
  const office = 'office_support';
  const extra = store.hireAgent(office, 'writer', '둘째 작성자');
  const team = store.data.agents.filter((a) => a.officeId === office);
  const by = (role: string) => team.find((a) => a.role === role && a.id !== extra.id)!;
  const steps = [
    { kind: 'brief' as const, label: '접수', agentId: by('manager').id, instructions: '', loop: null },
    { kind: 'draft' as const, label: '작성 A', agentId: by('writer').id, instructions: '', loop: null },
    { kind: 'draft' as const, label: '작성 B', agentId: extra.id, instructions: '', loop: null, parallel: true },
    { kind: 'review' as const, label: '검토', agentId: by('reviewer').id, instructions: '', loop: { to: 1, when: '기준 미달', max: 1 } },
    { kind: 'approval' as const, label: '승인', agentId: null, instructions: '', loop: null },
  ];
  assert.equal(validatePlan(steps, team), null, 'two drafts written together are one draft stage');
  assert.equal(validatePlan(steps.map((s, i) => (i === 2 ? { ...s, parallel: undefined } : s)), team), null, 'two drafts one after the other: the second rewrites the first');

  const startSeq = store.data.seq ?? 0;
  const task = await runtime.createTask({ officeId: office, title: '동시 작성', description: '고객 문의 답변 초안', taskType: 'email_draft', planMode: 'custom', steps });
  // Only the first writer asks, before anyone writes.
  await until(() => ['awaiting_help', 'awaiting_approval'].includes(store.task(task.id).status), '질문 또는 승인 대기');
  if (store.task(task.id).status === 'awaiting_help') {
    assert.equal(store.task(task.id).plan[2].status, 'pending', 'the second writer waits for the answer');
    await runtime.answerHelp(task.id, null);
  }
  await until(() => store.task(task.id).status === 'awaiting_approval', '승인 대기');
  const t = store.task(task.id);
  const { recentEvents } = await import('../server/db.ts');
  const events = recentEvents(400).filter((e) => e.taskId === task.id && e.seq > startSeq);
  const compared = events.filter((e) => e.type === 'draft.compared');
  assert.ok(compared.length >= 1, 'the drafts were compared');
  assert.equal(compared[0].payload.count, 2);
  assert.equal(compared[0].agentId, by('reviewer').id, 'the next step’s reviewer compares them');
  const writers = new Set(t.artifacts.filter((a) => a.kind === 'draft' && a.title === '초안').map((a) => a.agentId));
  assert.equal(writers.size, 2, 'each writer wrote a draft');
  assert.equal(t.artifacts.filter((a) => a.kind === 'draft').at(-1)!.title, '초안 (비교 후 선택)', 'the kept draft is the one that goes on');
  await runtime.approve(task.id);
  await until(() => store.task(task.id).status === 'completed', '완료');
});

test('intakes marked parallel read the request two ways at once, and the next step gets both work orders', async () => {
  const office = 'office_dev';
  const extra = store.hireAgent(office, 'manager', '둘째 팀장');
  const team = store.data.agents.filter((a) => a.officeId === office);
  const by = (role: string) => team.find((a) => a.role === role && a.id !== extra.id)!;
  const steps = [
    { kind: 'brief' as const, label: '접수 A', agentId: by('manager').id, instructions: '비용 관점', loop: null },
    { kind: 'brief' as const, label: '접수 B', agentId: extra.id, instructions: '사용자 경험 관점', loop: null, parallel: true },
    { kind: 'research' as const, label: '조사', agentId: by('researcher').id, instructions: '', loop: null },
    { kind: 'draft' as const, label: '작성', agentId: by('writer').id, instructions: '', loop: null },
    { kind: 'approval' as const, label: '승인', agentId: null, instructions: '', loop: null },
  ];
  assert.equal(validatePlan(steps, team), null, 'two intakes read together are the first stage');
  assert.equal(validatePlan(steps.map((s, i) => (i === 1 ? { ...s, parallel: undefined } : s)), team), null, 'a second intake after the first is a stage of its own');
  assert.match(validatePlan(steps.slice(1), team) ?? '', /접수·지시/, 'the journey still starts with an intake');

  const task = await runtime.createTask({ officeId: office, title: '두 가지 해석', description: '사내 도구 개선', planMode: 'custom', steps });
  await until(() => ['awaiting_help', 'awaiting_approval'].includes(store.task(task.id).status), '질문 또는 승인 대기');
  if (store.task(task.id).status === 'awaiting_help') await runtime.answerHelp(task.id, null);
  await until(() => store.task(task.id).status === 'awaiting_approval', '승인 대기');
  const orders = store.task(task.id).artifacts.filter((a) => a.kind === 'brief');
  assert.equal(new Set(orders.map((a) => a.agentId)).size, 2, 'each lead wrote a work order');
  await runtime.approve(task.id);
  await until(() => store.task(task.id).status === 'completed', '완료');
});
