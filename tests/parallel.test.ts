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
