import assert from 'node:assert/strict';
import test from 'node:test';
import type { Agent, WorkflowStepInput } from '../shared/types.ts';
import { normalizePlan, validatePlan } from '../shared/workflow.ts';

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

