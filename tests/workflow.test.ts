import assert from 'node:assert/strict';
import test from 'node:test';
import type { Agent, WorkflowStepInput } from '../shared/types.ts';
import { loopOpen, loopTargets, MAX_LOOP, normalizePlan, parseLoop, reviewLoop, validatePlan } from '../shared/workflow.ts';

const agents = [
  ['manager', 'manager'],
  ['researcher', 'researcher'],
  ['writer', 'writer'],
  ['reviewer', 'reviewer'],
].map(([id, role]) => ({ id, role, officeId: 'office_dev' })) as Agent[];

test('기본 업무 여정의 순서와 담당자를 검증한다', () => {
  const steps: WorkflowStepInput[] = [
    { kind: 'brief', label: '접수', agentId: 'manager', instructions: '' },
    { kind: 'research', label: '조사', agentId: 'researcher', instructions: '' },
    { kind: 'draft', label: '작성', agentId: 'writer', instructions: '' },
    { kind: 'review', label: '검수', agentId: 'reviewer', instructions: '', loop: { to: 2, when: '품질 미달', max: 2 } },
    { kind: 'approval', label: '승인', agentId: null, instructions: '' },
  ];
  assert.equal(validatePlan(steps, agents), null);
});

test('되돌리기 횟수는 비워 두면 조건이 맞을 때까지이고, 적으면 그만큼만이다', () => {
  assert.deepEqual(parseLoop({ to: 0, when: '부족하면' }), { to: 0, when: '부족하면', max: null });
  assert.equal(parseLoop({ to: 0, when: '부족하면', max: 2 })?.max, 2);
  assert.equal(parseLoop({ to: 0, when: '부족하면', max: 99 })?.max, MAX_LOOP);
  assert.equal(loopOpen({ to: 0, when: '부족하면', max: null }, 8), true);
  assert.equal(loopOpen({ to: 0, when: '부족하면', max: 2 }, 2), false);
  const unlimited: WorkflowStepInput[] = [
    { kind: 'brief', label: '접수', agentId: 'manager', instructions: '' },
    { kind: 'research', label: '조사', agentId: 'researcher', instructions: '' },
    { kind: 'draft', label: '작성', agentId: 'writer', instructions: '' },
    { kind: 'review', label: '검수', agentId: 'reviewer', instructions: '', loop: { to: 2, when: '품질 미달', max: null } },
    { kind: 'approval', label: '승인', agentId: null, instructions: '' },
  ];
  assert.equal(validatePlan(unlimited, agents), null);
  assert.equal(reviewLoop(unlimited).max, null);
});

test('되돌릴 단계는 지금 여정에 있는 앞 단계와 자기 자신이다', () => {
  const steps: WorkflowStepInput[] = [
    { kind: 'brief', label: '접수', agentId: 'manager', instructions: '' },
    { kind: 'research', label: '조사 A', agentId: 'researcher', instructions: '' },
    { kind: 'research', label: '조사 B', agentId: 'researcher', instructions: '' },
    { kind: 'draft', label: '작성', agentId: 'writer', instructions: '' },
    { kind: 'review', label: '1차 검토', agentId: 'reviewer', instructions: '', loop: { to: 1, when: '자료가 모자라면', max: null } },
    { kind: 'review', label: '2차 검토', agentId: 'reviewer', instructions: '', loop: { to: 4, when: '1차를 다시', max: null } },
    { kind: 'approval', label: '승인', agentId: null, instructions: '' },
  ];
  assert.deepEqual(loopTargets(steps, 1), [0, 1]);
  assert.deepEqual(loopTargets(steps, 4), [0, 1, 2, 3, 4]);
  assert.deepEqual(loopTargets(steps, 5), [0, 1, 2, 3, 4, 5]);
  assert.equal(validatePlan(steps, agents), null);
  assert.ok(validatePlan(steps.map((s, i) => (i === 5 ? { ...s, loop: { to: 6, when: '승인으로', max: null } } : s)), agents));
});

test('AI가 제안한 잘못된 순서를 실행 가능한 순서로 정규화한다', () => {
  const result = normalizePlan(
    [
      { kind: 'review', label: '먼저 검수', agentId: 'reviewer', instructions: '' },
      { kind: 'draft', label: '나중 작성', agentId: 'writer', instructions: '' },
    ],
    'dev',
    'feature',
    agents,
  );
  assert.equal(result[0].kind, 'brief');
  assert.equal(result.at(-1)?.kind, 'approval');
  assert.equal(validatePlan(result, agents), null);
});

