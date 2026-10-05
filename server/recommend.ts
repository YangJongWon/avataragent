import { TEAMS, taskTypeOf } from '../shared/teams.ts';
import type { WorkflowStepInput } from '../shared/types.ts';
import { STEP_KIND, templatePlan } from '../shared/workflow.ts';
import { parseJson } from './ai.ts';
import { popularFlows } from './community.ts';
import { callAI } from './orchestrator.ts';
import { store } from './store.ts';

/**
 * Help while making a task: which journey fits the request (saved, community or the type's default), a clearer
 * request, and instructions for each step. The office manager answers, and the cost goes to the office like any
 * other AI call. The mock answers by keywords so it works without keys.
 */

export interface RequestInput {
  officeId: string;
  title: string;
  description: string;
  taskType: string;
}

export interface FlowPick {
  source: 'saved' | 'community' | 'template';
  /** Saved flow id, community item id, or 'template'. */
  id: string;
  name: string;
  reason: string;
}

interface Candidate extends Omit<FlowPick, 'reason'> {
  key: string;
  text: string;
}

const MAX_PICKS = 3;
const words = (text: string) => new Set((text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((w) => !STOP.has(w)));
const STOP = new Set(['그리고', '해서', '하는', '있는', '해주세요', '주세요', '업무', '정리', 'the', 'and', 'for']);
const requestText = (input: RequestInput) => `${input.title} ${input.description}`.trim();

function manager(officeId: string) {
  return store.agentByRole(officeId, 'manager');
}

async function candidates(input: RequestInput): Promise<Candidate[]> {
  const office = store.office(input.officeId);
  const type = taskTypeOf(office.team, input.taskType);
  const template = templatePlan(office.team, input.taskType, store.data.agents.filter((a) => a.officeId === office.id));
  const list: Candidate[] = [
    { key: 't', source: 'template', id: 'template', name: `${type.label} 기본 여정`, text: `${type.label} ${template.map((s) => s.label).join(' ')}` },
  ];
  store.data.flows.slice(-12).forEach((f, i) => {
    list.push({
      key: `s${i + 1}`,
      source: 'saved',
      id: f.id,
      name: f.flow.name,
      text: `${f.flow.name} ${f.flow.description} ${f.flow.steps.map((s) => `${s.label} ${s.instructions}`).join(' ')}`,
    });
  });
  const saved = new Set(store.data.flows.map((f) => f.itemId).filter(Boolean));
  (await popularFlows(8))
    .filter((p) => !saved.has(p.id))
    .forEach((p, i) => list.push({ key: `c${i + 1}`, source: 'community', id: p.id, name: p.title, text: `${p.title} ${p.summary} ${p.tags.join(' ')}` }));
  return list;
}

function mockPicks(input: RequestInput, list: Candidate[]) {
  const want = words(requestText(input));
  const scored = list
    .map((c) => ({ c, hits: [...words(c.text)].filter((w) => want.has(w)) }))
    .filter((x) => x.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length)
    .slice(0, MAX_PICKS);
  return JSON.stringify({
    picks: scored.map((x) => ({ key: x.c.key, reason: `요청의 "${x.hits.slice(0, 3).join('", "')}"와(과) 잘 맞아요.` })),
    note: scored.length ? '' : '요청과 딱 맞는 흐름이 없어요. "AI가 설계"로 새로 짜 보는 걸 추천해요.',
  });
}

/** Up to three journeys that fit the request, best first, each with a reason. */
export async function recommendFlows(input: RequestInput): Promise<{ picks: FlowPick[]; note: string }> {
  const list = await candidates(input);
  const raw = await callAI(
    manager(input.officeId),
    null,
    'suggest',
    [
      `업무 제목: ${input.title || '(제목 없음)'}`,
      input.description ? `요청 내용: ${input.description}` : '',
      '',
      '[고를 수 있는 업무 흐름]',
      ...list.map((c) => `- ${c.key} (${c.source === 'saved' ? '저장한 흐름' : c.source === 'community' ? '커뮤니티 인기' : '유형 기본'}): ${c.text.slice(0, 240)}`),
      '',
      `요청에 가장 잘 맞는 흐름을 최대 ${MAX_PICKS}개, 잘 맞는 순서로 골라라. 맞지 않으면 고르지 말고 비워 둔다.`,
      'JSON으로만 답한다: {"picks": [{"key": string, "reason": string (왜 맞는지 한 문장)}], "note": string (맞는 게 없을 때만 한 문장)}',
    ]
      .filter(Boolean)
      .join('\n'),
    () => mockPicks(input, list),
    true,
  );
  const parsed = parseJson(raw, { picks: [] as { key?: unknown; reason?: unknown }[], note: '' });
  const byKey = new Map(list.map((c) => [c.key, c]));
  const seen = new Set<string>();
  const picks: FlowPick[] = [];
  for (const p of Array.isArray(parsed.picks) ? parsed.picks : []) {
    const c = byKey.get(String(p?.key ?? ''));
    if (!c || seen.has(c.key)) continue;
    seen.add(c.key);
    picks.push({ source: c.source, id: c.id, name: c.name, reason: String(p.reason ?? '').slice(0, 160) });
    if (picks.length >= MAX_PICKS) break;
  }
  return { picks, note: picks.length ? '' : String(parsed.note ?? '').slice(0, 200) || '요청과 딱 맞는 흐름이 없어요. "AI가 설계"로 새로 짜 보세요.' };
}

function mockPrompt(input: RequestInput) {
  const office = store.office(input.officeId);
  const type = taskTypeOf(office.team, input.taskType);
  const topic = input.title.trim() || input.description.trim().split('\n')[0].slice(0, 40) || type.label;
  const tips: string[] = [];
  if (input.description.trim().length < 30) tips.push('누가 읽을 결과물인지, 어디에 쓸지 적으면 더 맞는 결과가 나와요.');
  if (!/까지|마감|분량|장|페이지|자\b/.test(input.description)) tips.push('분량이나 마감이 있으면 적어 주세요.');
  if (!/자료|링크|첨부|참고/.test(input.description)) tips.push('참고할 자료나 링크가 있으면 붙여 주세요.');
  return JSON.stringify({
    title: topic.slice(0, 40),
    description: [
      `목표: ${topic}에 대한 ${type.label}를 만든다.`,
      input.description.trim() ? `배경: ${input.description.trim()}` : '',
      '결과물: 핵심 결론을 맨 앞에 두고, 근거는 항목별로 정리한다.',
      '주의: 출처를 밝히고, 확인되지 않은 내용은 "확인 필요"로 표시한다.',
    ]
      .filter(Boolean)
      .join('\n'),
    tips: tips.slice(0, 3),
  });
}

/** A clearer request: goal, background, expected output and cautions, plus what is still missing. */
export async function suggestPrompt(input: RequestInput): Promise<{ title: string; description: string; tips: string[] }> {
  const office = store.office(input.officeId);
  const type = taskTypeOf(office.team, input.taskType);
  const raw = await callAI(
    manager(input.officeId),
    null,
    'suggest',
    [
      `팀: ${TEAMS[office.team].name} / 업무 유형: ${type.label}`,
      `업무 제목: ${input.title || '(없음)'}`,
      `요청 내용: ${input.description || '(없음)'}`,
      '',
      '이 요청을 직원들이 헷갈리지 않게 다듬어라. 사용자가 쓴 사실만 쓰고 새로운 사실을 지어내지 마라.',
      '목표, 배경, 결과물(형식·분량), 주의할 점을 짧은 줄로 정리하고, 빠진 정보는 tips로 묻는다.',
      'JSON으로만 답한다: {"title": string (40자 이내), "description": string (600자 이내, 줄바꿈 가능), "tips": [string] (최대 3개)}',
    ].join('\n'),
    () => mockPrompt(input),
    true,
  );
  const parsed = parseJson(raw, { title: input.title, description: input.description, tips: [] as unknown[] });
  return {
    title: String(parsed.title ?? input.title).trim().slice(0, 40) || input.title,
    description: String(parsed.description ?? '').trim().slice(0, 600) || input.description,
    tips: (Array.isArray(parsed.tips) ? parsed.tips : []).map((t) => String(t).slice(0, 120)).filter(Boolean).slice(0, 3),
  };
}

function mockInstructions(input: RequestInput, steps: WorkflowStepInput[]) {
  const topic = input.title.trim() || input.description.trim().slice(0, 30) || '요청';
  const byKind: Record<string, string> = {
    brief: `"${topic}" 요청에서 목표·범위·마감을 뽑아 지시서로 정리한다.`,
    research: `"${topic}"에 필요한 사실과 수치를 모으고 항목마다 출처를 붙인다.`,
    draft: '조사 메모를 바탕으로 결론을 먼저 쓰고, 근거를 항목별로 정리한다.',
    review: '근거 없는 문장, 빠진 요구사항, 숫자 오류가 있는지 점검한다.',
  };
  return JSON.stringify({ instructions: steps.map((s) => (s.kind === 'approval' ? '' : byKind[s.kind])) });
}

/** Fills empty step instructions only; what the person already wrote stays. */
export async function suggestInstructions(input: RequestInput & { steps: WorkflowStepInput[] }): Promise<WorkflowStepInput[]> {
  const steps = input.steps
    .filter((s) => s && typeof s === 'object' && s.kind in STEP_KIND)
    .map((s) => ({ ...s, label: String(s.label ?? '').slice(0, 20), instructions: String(s.instructions ?? '') }));
  if (!steps.some((s) => s.kind !== 'approval' && !s.instructions.trim())) return steps;
  const raw = await callAI(
    manager(input.officeId),
    null,
    'suggest',
    [
      `업무 제목: ${input.title || '(없음)'}`,
      input.description ? `요청 내용: ${input.description}` : '',
      '',
      '[업무 여정]',
      ...steps.map((s, i) => `${i}. ${STEP_KIND[s.kind].title} | ${s.label}${s.instructions ? ` | 지금 지시: ${s.instructions}` : ''}`),
      '',
      '각 단계 담당자에게 줄 구체적인 지시를 한 문장씩 써라(80자 이내). 사용자 승인 단계는 빈 문자열.',
      'JSON으로만 답한다: {"instructions": [string] (단계 순서대로, 단계 수와 같은 길이)}',
    ]
      .filter(Boolean)
      .join('\n'),
    () => mockInstructions(input, steps),
    true,
  );
  const parsed = parseJson(raw, { instructions: [] as unknown[] });
  const list = Array.isArray(parsed.instructions) ? parsed.instructions : [];
  return steps.map((s, i) =>
    s.kind === 'approval' || s.instructions.trim() ? s : { ...s, instructions: String(list[i] ?? '').trim().slice(0, 300) },
  );
}
