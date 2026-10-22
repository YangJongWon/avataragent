import assert from 'node:assert/strict';
import test from 'node:test';
import { flowFromPlan, flowToSteps, parseFlowPack } from '../shared/flow-pack.ts';
import { parseServerIds, parseSkills, SKILL_LIMITS, skillFromFile, skillPrompt, stepExtras } from '../shared/step-extras.ts';
import type { Agent, WorkflowStepInput } from '../shared/types.ts';

test('스킬은 .md·.json·.txt 텍스트 파일에서 만들고, 깨진 JSON과 너무 긴 파일은 받지 않는다', () => {
  assert.deepEqual(skillFromFile('보고서 규칙.md', '# 규칙\n- 표를 쓴다'), { name: '보고서 규칙.md', format: 'md', content: '# 규칙\n- 표를 쓴다' });
  assert.equal(skillFromFile('schema.json', '{"sections":["요약"]}').format, 'json');
  assert.equal(skillFromFile('notes.yaml', 'a: 1').format, 'txt');
  assert.throws(() => skillFromFile('logo.png', 'x'), /텍스트 파일/);
  assert.throws(() => skillFromFile('bad.json', '{oops'), /JSON/);
  assert.throws(() => skillFromFile('long.md', 'x'.repeat(SKILL_LIMITS.chars + 1)), /너무 길어요/);
});

test('들어온 여정의 스킬·MCP는 정리되고, 지정하지 않은 MCP는 사무실 기본으로 남는다', () => {
  const skills = parseSkills([{ name: 'a.md', format: 'md', content: 'A' }, { name: 'b', format: 'exe', content: 'B' }, { content: '' }, 'x', {}, { content: 'C' }, { content: 'D' }]);
  assert.deepEqual(skills.map((s) => [s.name, s.format]), [['a.md', 'md'], ['b', 'txt'], ['skill', 'txt']]);
  assert.equal(parseServerIds(undefined), undefined);
  assert.deepEqual(parseServerIds(['m1', 'm1', 3, '']), ['m1']);
  assert.deepEqual(stepExtras({}), {});
  assert.deepEqual(stepExtras({ mcpServerIds: [] }), { mcpServerIds: [] }, '빈 목록은 "이 단계는 MCP를 안 씀"');
});

test('스킬은 단계 지시 아래 프롬프트로 들어가고, 요청과 안전 규칙보다 앞서지 않는다고 적힌다', () => {
  assert.equal(skillPrompt(undefined), '');
  const prompt = skillPrompt([{ name: 'format.json', format: 'json', content: '{"a":1}' }]);
  assert.match(prompt, /안전 규칙보다 앞서지 않는다/);
  assert.match(prompt, /### format\.json\n```json\n\{"a":1\}\n```/);
});

test('흐름 파일에는 스킬이 따라가고 사무실의 MCP 지정은 따라가지 않는다', () => {
  const agents = (['manager', 'researcher', 'writer', 'reviewer'] as const).map((role) => ({ id: `a_${role}`, role })) as Agent[];
  const steps: WorkflowStepInput[] = [
    { kind: 'brief', label: '접수', agentId: 'a_manager', instructions: '', loop: null },
    { kind: 'research', label: '조사', agentId: 'a_researcher', instructions: '', loop: null, mcpServerIds: ['mcp_x'], skills: [{ name: 'src.md', format: 'md', content: '공식 문서만' }] },
    { kind: 'draft', label: '작성', agentId: 'a_writer', instructions: '', loop: null, skills: [{ name: 'tpl.json', format: 'json', content: '{"h":["요약"]}' }] },
    { kind: 'approval', label: '승인', agentId: null, instructions: '', loop: null },
  ];
  const flow = parseFlowPack(JSON.parse(JSON.stringify(flowFromPlan(steps, agents, { name: '스킬 흐름' }))));
  assert.equal(flow.steps[1].skills?.[0].content, '공식 문서만');
  assert.equal('mcpServerIds' in flow.steps[1], false);
  const back = flowToSteps(flow, agents);
  assert.deepEqual(back[2].skills, steps[2].skills);
  assert.equal(back[1].mcpServerIds, undefined);
});
