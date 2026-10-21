import assert from 'node:assert/strict';
import test from 'node:test';
import type { Agent, WorkflowStepInput } from '../shared/types.ts';
import { validatePlan } from '../shared/workflow.ts';
import { rewire } from '../web/src/planOps.ts';

const agents = [
  { id: 'm', role: 'manager' },
  { id: 'r', role: 'researcher' },
  { id: 'r2', role: 'researcher' },
  { id: 'w', role: 'writer' },
  { id: 'v', role: 'reviewer' },
  { id: 'v2', role: 'reviewer' },
] as Agent[];

const step = (kind: WorkflowStepInput['kind'], agentId: string | null, label: string): WorkflowStepInput => ({ kind, label, agentId, instructions: '', loop: null });
// 접수 → 정보 수집 → 추가 조사 → 작성 → 검토 A → 검토 B → 승인, as in the journey on screen.
const plan = (): WorkflowStepInput[] => [
  step('brief', 'm', '접수'),
  step('research', 'r', '정보 수집'),
  { ...step('research', 'r2', '추가 조사'), loop: { to: 2, when: '부족하면', max: 1 } },
  step('draft', 'w', '작성'),
  { ...step('review', 'v', '검토 A'), loop: { to: 3, when: '반려', max: 2 } },
  { ...step('review', 'v2', '검토 B'), loop: { to: 3, when: '반려', max: 2 } },
  step('approval', null, '승인'),
];

test('접수에서 추가 조사로 선을 그으면 정보 수집과 동시에 진행한다', () => {
  const result = rewire(plan(), 0, 2)!;
  assert.equal(result.index, 2);
  assert.equal(result.steps[2].parallel, true);
  assert.equal(result.steps[2].loop, null, '동시 조사에는 되돌리기가 없다');
  assert.equal(validatePlan(result.steps, agents), null);
});

test('작성에서 검토 B로 그으면 검토 둘이 다수결로 동시에 진행하고, 첫 검토의 되돌리기는 남는다', () => {
  const result = rewire(plan(), 3, 5)!;
  assert.equal(result.steps[5].parallel, true);
  assert.equal(result.steps[5].loop, null);
  assert.deepEqual(result.steps[4].loop, { to: 3, when: '반려', max: 2 });
  assert.equal(validatePlan(result.steps, agents), null);
});

test('동시에 진행하는 단계끼리 이으면 다시 순서대로 바뀐다', () => {
  const together = rewire(plan(), 0, 2)!.steps;
  const result = rewire(together, 1, 2)!;
  assert.equal(result.steps[2].parallel, undefined);
  assert.equal(validatePlan(result.steps, agents), null);
});

test('셋째 단계를 묶음에 넣으면 묶음 끝으로 옮겨지고 되돌리기는 같은 단계를 가리킨다', () => {
  const three = [...plan().slice(0, 3), step('research', 'r', '시장 조사'), ...plan().slice(3)].map((s) =>
    s.loop && s.kind === 'review' ? { ...s, loop: { ...s.loop, to: 4 } } : s,
  );
  const first = rewire(three, 0, 2)!.steps;
  const result = rewire(first, 0, 3)!;
  assert.deepEqual(result.steps.slice(1, 4).map((s) => [s.label, Boolean(s.parallel)]), [['정보 수집', false], ['추가 조사', true], ['시장 조사', true]]);
  assert.equal(result.steps[5].loop?.to, 4, '검토의 되돌리기는 여전히 작성 단계');
  assert.equal(validatePlan(result.steps, agents), null);
});

test('뜻이 없는 선과 이미 시작한 단계는 바꾸지 않는다', () => {
  assert.equal(rewire(plan(), 1, 2), null, '이미 순서대로 이어진 두 조사');
  assert.equal(rewire(plan(), 0, 3), null, '작성 단계는 동시에 진행할 수 없다');
  assert.equal(rewire(plan(), 0, 2, 2), null, '시작한 정보 수집에는 끼어들 수 없다');
});
