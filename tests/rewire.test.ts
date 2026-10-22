import assert from 'node:assert/strict';
import test from 'node:test';
import type { Agent, WorkflowStepInput } from '../shared/types.ts';
import { validatePlan } from '../shared/workflow.ts';
import { addToStage, removeFromStage, rewire, separateFromStage, stagesOf } from '../web/src/planOps.ts';

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

test('같은 단계에 추가하면 아직 그 단계에 없는 직원이 맡아 동시에 진행한다', () => {
  const added = addToStage(plan(), 1, agents, '정보 수집 2');
  assert.deepEqual(stagesOf(added), [[0], [1, 2], [3], [4], [5], [6], [7]]);
  assert.equal(added[2].agentId, 'r2', '정보 수집을 맡은 r 말고 다른 리서처');
  assert.equal(added[2].parallel, true);
  assert.equal(validatePlan(added, agents), null);
  const reviews = addToStage(plan(), 4, agents, '검토 A 2');
  assert.equal(reviews[5].agentId, 'v2');
  assert.equal(reviews[5].loop, null);
  assert.deepEqual(reviews[4].loop, { to: 3, when: '반려', max: 2 }, '단계를 이끄는 검토의 되돌리기는 남는다');
  assert.equal(validatePlan(reviews, agents), null);
});

test('단계를 이끄는 검토를 빼면 다음 검토가 이끌고 되돌리기를 물려받는다', () => {
  const together = addToStage(plan(), 4, agents, '검토 A 2');
  const removed = removeFromStage(together, 4);
  assert.equal(removed[4].label, '검토 A 2');
  assert.equal(removed[4].parallel, undefined);
  assert.deepEqual(removed[4].loop, { to: 3, when: '반려', max: 2 });
  assert.equal(validatePlan(removed, agents), null);
});

test('따로 진행하면 묶음 바로 다음 단계가 된다', () => {
  const three = addToStage(addToStage(plan(), 1, agents, 'B'), 1, agents, 'C');
  assert.deepEqual(stagesOf(three)[1], [1, 2, 3]);
  const apart = separateFromStage(three, 2);
  assert.deepEqual(apart.slice(1, 4).map((s) => [s.label, Boolean(s.parallel)]), [['정보 수집', false], ['C', true], ['B', false]]);
  assert.equal(validatePlan(apart, agents), null);
});

test('단계 번호를 바꾸면 그 단계로 옮기고, 같은 종류 단계의 번호면 그 단계와 동시에 진행한다', async () => {
  const { setStage, stagesOf } = await import('../web/src/planOps.ts');
  // 접수(1) 정보 수집(2) 추가 조사(3) 작성(4) 검토 A(5) 검토 B(6) 승인(7)
  const joined = setStage(plan(), 2, 1)!;
  assert.deepEqual(stagesOf(joined), [[0], [1, 2], [3], [4], [5], [6]], '추가 조사가 2단계(정보 수집)에 합쳐진다');
  assert.equal(joined[2].parallel, true);
  assert.equal(validatePlan(joined, agents), null);

  const later = setStage(plan(), 1, 3)!;
  assert.deepEqual(later.map((s) => s.label), ['접수', '추가 조사', '작성', '정보 수집', '검토 A', '검토 B', '승인'], '조사를 작성 뒤로 옮길 수도 있다');
  assert.equal(validatePlan(later, agents), null);

  assert.equal(setStage(plan(), 4, 1), null, '검토를 작성 앞으로는 옮길 수 없다');
  assert.equal(setStage(plan(), 1, 0), null, '첫 단계는 접수·지시다');
});

test('어떤 종류의 단계든 추가할 수 있고, 규칙을 깨는 자리에는 넣지 않는다', async () => {
  const { insertIndex, insertStep } = await import('../web/src/planOps.ts');
  for (const kind of ['brief', 'research', 'draft', 'review'] as const) {
    const at = insertIndex(plan(), kind, null);
    assert.notEqual(at, null, kind);
    assert.equal(validatePlan(insertStep(plan(), kind, agents, at!, kind), agents), null, kind);
  }
  assert.equal(insertIndex(plan(), 'approval', null), null, '승인은 하나만');
  const noApproval = plan().slice(0, -1);
  assert.equal(insertIndex(noApproval, 'approval', null), noApproval.length);
  const reviseAfterReview = insertStep(plan(), 'draft', agents, insertIndex(plan(), 'draft', null)!, '수정 작성');
  assert.equal(reviseAfterReview.at(-2)!.kind, 'draft', '검토 뒤에 고쳐 쓰는 작성 단계');
});
