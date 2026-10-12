import assert from 'node:assert/strict';
import test from 'node:test';
import type { Agent, WorkflowStepInput } from '../shared/types.ts';
import { validatePlan } from '../shared/workflow.ts';
import { canMove, canRemove, changeKind, insertIndex, insertStep, removeStep } from '../web/src/planOps.ts';

const agents = [
  { id: 'm', role: 'manager' },
  { id: 'r', role: 'researcher' },
  { id: 'w', role: 'writer' },
  { id: 'v', role: 'reviewer' },
] as Agent[];

const step = (kind: WorkflowStepInput['kind'], agentId: string | null, label = kind): WorkflowStepInput => ({ kind, label, agentId, instructions: '', loop: null });
const plan = (): WorkflowStepInput[] => [step('brief', 'm'), step('research', 'r'), step('draft', 'w'), { ...step('review', 'v'), loop: { to: 2, when: '근거 부족', max: 2 } }, step('approval', null)];

test('새 조사는 작성 앞, 새 검토는 작성 뒤에 들어가고 잠긴 단계 안에는 못 들어간다', () => {
  assert.equal(insertIndex(plan(), 'research', 1), 2);
  assert.equal(insertIndex(plan(), 'review', 1), 3);
  assert.equal(insertIndex(plan(), 'review', null), 4);
  assert.equal(insertIndex(plan(), 'research', null, 3), null);
  const added = insertStep(plan(), 'research', agents, 2, '추가 조사');
  assert.equal(added[2].agentId, 'r');
  assert.equal(added[4].loop?.to, 3, '검토의 되돌아가기가 밀린 작성 단계를 그대로 가리킨다');
  assert.equal(validatePlan(added, agents), null);
});

test('조사를 검토로 바꾸면 작성 뒤로 옮기고 역할에 맞는 직원을 고른다', () => {
  const { steps, index } = changeKind(plan(), 1, 'review', agents);
  assert.deepEqual(steps.map((s) => s.kind), ['brief', 'draft', 'review', 'review', 'approval']);
  assert.equal(steps[index].kind, 'review');
  assert.equal(steps[index].agentId, 'v');
  assert.equal(validatePlan(steps, agents), null);
});

test('잠긴 단계는 옮기거나 지울 수 없고, 꼭 필요한 단계도 지울 수 없다', () => {
  assert.equal(canRemove(plan(), 1, 2), false);
  assert.equal(canRemove(plan(), 3, 2), true);
  assert.equal(canRemove(plan(), 2), false);
  assert.equal(canMove(plan(), 1, 1), false);
  const removed = removeStep(plan(), 1);
  assert.equal(removed[2].loop?.to, 1);
  assert.equal(validatePlan(removed, agents), null);
});
