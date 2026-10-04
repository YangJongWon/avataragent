import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-perf-'));
process.env.AI_PROVIDER = 'mock';
process.env.MOCK_DELAY_MS = '2';
process.env.HELP_TIMEOUT_SEC = '600';

const { localWorkflowRuntime: runtime } = await import('../server/workflow-runtime.ts');
const { autoImproveOffice, improvementsFor } = await import('../server/orchestrator.ts');
const { store } = await import('../server/store.ts');
const { until } = await import('./runtime-contract.ts');
const { lessonsFor, rankAgents, researchOf, reviewsOf, suggestImprovements } = await import('../shared/performance.ts');

const OFFICE = 'office_dev';

async function runToEnd(title: string) {
  const task = await runtime.createTask({ officeId: OFFICE, title, description: '테스트' });
  const status = () => store.task(task.id).status;
  await until(() => ['awaiting_help', 'awaiting_approval'].includes(status()), `${title} 진행`);
  if (status() === 'awaiting_help') await runtime.answerHelp(task.id, null);
  await until(() => status() === 'awaiting_approval', `${title} 승인 대기`);
  await runtime.approve(task.id);
  await until(() => status() === 'completed', `${title} 완료`);
  return task.id;
}

test('records research speed and accuracy, review results and the user verdict, then improves by itself', async (t) => {
  t.after(() => runtime.stop());
  await runtime.start();
  const researcher = store.agentByRole(OFFICE, 'researcher');
  store.updateAgent(researcher.id, { personality: 'fast' });

  const first = await runToEnd('기록 1');
  const research = researchOf(store.data.performance).filter((r) => r.taskId === first);
  assert.ok(research.length >= 1);
  assert.ok(research.every((r) => r.accuracy !== null && r.accuracy < 70 && r.durationMs >= 0 && r.personality === 'fast'));
  const reviews = reviewsOf(store.data.performance).filter((r) => r.taskId === first);
  assert.ok(reviews.length >= 1);
  assert.ok(reviews.every((r) => r.userVerdict === 'approved'));

  const rejected = reviews.find((r) => !r.approved);
  if (rejected) {
    assert.deepEqual(lessonsFor(store.data.performance, OFFICE, store.task(first).taskType, 'draft', 'other'), [rejected.reason]);
    assert.deepEqual(lessonsFor(store.data.performance, OFFICE, store.task(first).taskType, 'draft', first), []);
  }

  await runToEnd('기록 2');
  await runToEnd('기록 3');

  const suggestion = improvementsFor(OFFICE).find((s) => s.agentId === researcher.id);
  assert.equal(suggestion?.to, 'careful');
  assert.equal(suggestion?.safe, true);

  autoImproveOffice(OFFICE);
  assert.equal(store.agent(researcher.id).personality, 'careful');
  assert.equal(store.data.improvements[0].auto, true);
  assert.equal(improvementsFor(OFFICE).filter((s) => s.agentId === researcher.id).length, 0, 'a change starts a fresh count');
});

test('the proven performer of a role is ranked first and an auto change is never auto-reverted', () => {
  const base = store.agentByRole(OFFICE, 'researcher');
  const peer = { ...base, id: 'peer', name: '동료' };
  const record = (agentId: string, accuracy: number, i: number) => ({
    id: `r${agentId}${i}`,
    kind: 'research' as const,
    at: '',
    officeId: OFFICE,
    taskId: `t${i}`,
    taskType: '',
    stepId: 's',
    stepLabel: '조사',
    agentId,
    model: base.model,
    personality: base.personality,
    durationMs: 1000,
    toolCalls: 0,
    toolFailures: 0,
    accuracy,
  });
  const records = [0, 1, 2].flatMap((i) => [record(base.id, 60, i), record('peer', 90, i)]);
  assert.deepEqual(rankAgents([base, peer], records).map((a) => a.id), ['peer', base.id]);

  const low = { ...base, personality: 'balanced' as const };
  const lowRecords = records.map((r) => ({ ...r, personality: 'balanced' as const }));
  const history = [{ id: 'x', officeId: OFFICE, agentId: base.id, field: 'personality' as const, from: 'careful', to: 'balanced', reason: '', safe: true, appliedAt: '', auto: true }];
  const [again] = suggestImprovements(OFFICE, [low], lowRecords, store.data.models, history);
  assert.equal(again.to, 'careful');
  assert.equal(again.safe, false);
});
