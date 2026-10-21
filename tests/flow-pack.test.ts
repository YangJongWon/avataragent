import assert from 'node:assert/strict';
import test from 'node:test';

const { FLOW_FORMAT, flowFromPlan, flowToSteps, parseFlowPack } = await import('../shared/flow-pack.ts');
import type { Agent, WorkflowStepInput } from '../shared/types.ts';

const agent = (id: string, role: Agent['role']) => ({ id, role }) as Agent;
const office = [agent('a-m', 'manager'), agent('a-r', 'researcher'), agent('a-w', 'writer'), agent('a-v', 'reviewer')];
const plan: WorkflowStepInput[] = [
  { kind: 'brief', label: '접수', agentId: 'a-m', instructions: '요청 정리', loop: null },
  { kind: 'research', label: '시장 조사', agentId: 'a-r', instructions: '경쟁사 3곳', loop: null },
  { kind: 'draft', label: '보고서', agentId: 'a-w', instructions: '', loop: null },
  { kind: 'review', label: '검토', agentId: 'a-v', instructions: '', loop: { to: 2, when: '근거가 부족하면', max: 2 } },
  { kind: 'approval', label: '승인', agentId: null, instructions: '', loop: null },
];

test('a plan becomes a flow with roles and fits back into another office', () => {
  const flow = flowFromPlan(plan, office, { name: '시장 보고서', team: 'mgmt' });
  assert.equal(flow.format, FLOW_FORMAT);
  assert.equal(flow.license, 'CC-BY-4.0');
  assert.deepEqual(flow.steps.map((s) => s.role), ['manager', 'researcher', 'writer', 'reviewer', null]);
  assert.ok(!JSON.stringify(flow).includes('a-m'), 'agent ids are not shared');

  const other = [agent('b-1', 'writer'), agent('b-2', 'manager')];
  const steps = flowToSteps(parseFlowPack(JSON.parse(JSON.stringify(flow))), other);
  assert.deepEqual(steps.map((s) => s.agentId), ['b-2', 'b-1', 'b-1', 'b-1', null], 'missing roles go to the first agent');
  assert.deepEqual(steps[3].loop, { to: 2, when: '근거가 부족하면', max: 2 });
  assert.equal(steps[1].instructions, '경쟁사 3곳');
});

test('broken flows are refused with a reason', () => {
  const good = flowFromPlan(plan, office, { name: 'x' });
  const bad = (change: (f: any) => void) => {
    const f = structuredClone(good) as any;
    change(f);
    return () => parseFlowPack(f);
  };
  assert.throws(bad((f) => (f.format = 'other')), /플로우 파일이 아니에요/);
  assert.throws(bad((f) => (f.license = '')), /라이선스/);
  assert.doesNotThrow(bad((f) => f.steps.pop()), '승인 단계가 없으면 자동 승인 흐름이다');
  assert.throws(bad((f) => f.steps.splice(2, 0, f.steps.pop())), /사용자 승인은 마지막 단계/);
  assert.throws(bad((f) => (f.steps[3].loop.to = 4)), /되돌아갈 수 있어요/);
  assert.throws(bad((f) => (f.steps[1].kind = 'hack')), /알 수 없는 단계/);
  assert.throws(bad((f) => (f.steps = Array.from({ length: 11 }, () => f.steps[1]))), /10단계/);
});

test('long text is cut and unknown fields dropped', () => {
  const f = structuredClone(flowFromPlan(plan, office, { name: 'x' })) as any;
  f.steps[1].instructions = '가'.repeat(1000);
  f.steps[1].agentId = 'secret';
  f.extra = 'drop me';
  const parsed = parseFlowPack(f);
  assert.equal(parsed.steps[1].instructions.length, 300);
  assert.ok(!('extra' in parsed) && !('agentId' in parsed.steps[1]));
});
