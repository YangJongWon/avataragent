import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Agent } from '../shared/types.ts';
import { config } from './config.ts';
import { canReview } from './exports/designer.ts';
import { callAI } from './orchestrator.ts';
import { store } from './store.ts';

/** Docs the help answers come from, in priority order. */
const SOURCES: [file: string, label: string][] = [
  ['docs/HELP.md', '도움말'],
  ['OPERATIONS.md', '운영 가이드'],
  ['README.md', '소개'],
];

export const HELP_TABS: Record<string, string> = { office: '사무실', hire: '직원 관리', models: '모델 관리', mcp: 'MCP 관리', profit: '손익·결산' };

interface Section {
  source: string;
  title: string;
  text: string;
  grams: Map<string, number>;
  titleGrams: Set<string>;
  length: number;
}

/** Words people type that the docs spell differently. */
const SYNONYMS: [RegExp, string][] = [
  [/파워포인트|피피티|\bppt\b|슬라이드/i, 'PowerPoint 슬라이드'],
  [/엑셀|\bxlsx\b/i, 'Excel'],
  [/워드|\bdocx\b/i, 'Word'],
  [/피디에프/i, 'PDF'],
  [/슬랙/i, 'Slack'],
  [/노션/i, 'Notion'],
  [/깃허브|깃헙/i, 'GitHub'],
  [/실제 ?ai|진짜 ?ai|api ?키|openai|claude|gpt|제미나이|gemini/i, '모델 관리 실행 방식 직원별 실제 AI 키'],
  [/비번/i, '비밀번호'],
  [/돈|요금|과금/i, '비용 예산'],
];

const expand = (q: string) => [q, ...SYNONYMS.filter(([re]) => re.test(q)).map(([, add]) => add)].join(' ');

export interface HelpSource {
  source: string;
  title: string;
  text: string;
}

export interface HelpAnswer {
  answer: string;
  sources: HelpSource[];
  ai: boolean;
}

/** Hangul has no spaces between stems and endings, so words are compared by two-letter pieces; Latin words stay whole. */
function grams(text: string) {
  const out = new Map<string, number>();
  for (const word of text.toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, ' ').split(' ')) {
    if (word.length < 2) continue;
    const pieces = /^[a-z0-9_]+$/.test(word) ? [word] : Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2));
    for (const p of pieces) out.set(p, (out.get(p) ?? 0) + 1);
  }
  return out;
}

function load(): Section[] {
  const sections: Section[] = [];
  for (const [file, label] of SOURCES) {
    let raw: string;
    try {
      raw = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');
    } catch {
      continue;
    }
    let h2 = '';
    let title = '';
    let lines: string[] = [];
    const flush = () => {
      const text = lines.join('\n').trim();
      if (title && text) {
        const g = grams(`${title}\n${text}`);
        sections.push({ source: label, title, text, grams: g, titleGrams: new Set(grams(title).keys()), length: [...g.values()].reduce((a, b) => a + b, 0) });
      }
      lines = [];
    };
    for (const line of raw.split(/\r?\n/)) {
      const m = /^(#{2,3})\s+(.*)$/.exec(line);
      if (m) {
        flush();
        if (m[1] === '##') h2 = m[2].trim();
        title = m[1] === '##' ? h2 : `${h2} > ${m[2].trim()}`;
      } else if (!line.startsWith('# ')) {
        lines.push(line);
      }
    }
    flush();
  }
  return sections;
}

let cache: { sections: Section[]; idf: Map<string, number>; avgLength: number } | null = null;

function index() {
  if (!cache) {
    const sections = load();
    const df = new Map<string, number>();
    for (const s of sections) for (const g of s.grams.keys()) df.set(g, (df.get(g) ?? 0) + 1);
    const n = sections.length;
    const idf = new Map([...df].map(([g, d]) => [g, Math.log(1 + (n - d + 0.5) / (d + 0.5))]));
    cache = { sections, idf, avgLength: sections.reduce((a, s) => a + s.length, 0) / Math.max(n, 1) };
  }
  return cache;
}

/** BM25 over two-letter pieces, with extra weight when a piece is in the section title. */
export function searchHelp(question: string, tab = '', limit = 5): HelpSource[] {
  const { sections, idf, avgLength } = index();
  const q = grams(expand(question));
  const context = grams(HELP_TABS[tab] ?? '');
  const scored = sections.map((s, order) => {
    let score = 0;
    const norm = 1.2 * (0.25 + 0.75 * (s.length / avgLength));
    for (const g of q.keys()) {
      const tf = s.grams.get(g);
      if (!tf) continue;
      const w = idf.get(g) ?? 0;
      score += (w * tf * 2.2) / (tf + norm) + (s.titleGrams.has(g) ? w * 1.5 : 0);
    }
    for (const g of context.keys()) if (s.titleGrams.has(g)) score += 0.8;
    return { s, score: score - order * 1e-6 };
  });
  return scored
    .filter((x) => x.score > 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ s }) => ({ source: s.source, title: s.title, text: s.text.length > 2500 ? `${s.text.slice(0, 2500)}…` : s.text }));
}

function excerpt(found: HelpSource[]) {
  if (!found.length) return '도움말에서 관련 내용을 찾지 못했어요. 다른 말로 물어보거나, 화면 이름(예: MCP 관리, 내보내기)을 넣어 물어봐 주세요.';
  const [top, ...rest] = found;
  const more = rest.slice(0, 3).map((s) => `- ${s.title}`).join('\n');
  return `**${top.title}** (${top.source})\n\n${top.text}${more ? `\n\n함께 볼 만한 곳:\n${more}` : ''}`;
}

function appState() {
  const mode = store.provider === 'mock' ? '시뮬레이션' : store.provider === 'agents' ? '직원별 실제 AI' : `${store.provider} (.env 설정)`;
  return [
    `실행 방식: ${mode}`,
    `이 PC에서 명령으로 띄우는 MCP(MCP_ALLOW_STDIO): ${config.mcpAllowStdio ? '켜짐' : '꺼짐'}`,
    `고품질 화면 검수용 LibreOffice: ${canReview() ? '있음' : '없음'}`,
    `외부 주소(PUBLIC_URL): ${config.publicUrl ? '설정됨' : '없음'}`,
    `접속 비밀번호: ${config.accessPassword ? '설정됨' : '없음'}`,
  ].join('\n');
}

function helper(officeId: string | undefined): Agent | undefined {
  const agents = store.data.agents;
  const inOffice = agents.filter((a) => a.officeId === officeId);
  return inOffice.find((a) => a.role === 'manager') ?? inOffice[0] ?? agents.find((a) => a.role === 'manager') ?? agents[0];
}

export interface HelpTurn {
  question: string;
  answer: string;
}

/**
 * Answers a how-to question from the bundled docs. With `useAI` and a real provider the office's manager writes
 * the answer from the matching sections; otherwise the best matching section is shown as is.
 */
export async function answerHelp(input: { question: string; tab?: string; officeId?: string; history?: HelpTurn[] }, useAI: boolean): Promise<HelpAnswer> {
  const question = input.question.trim().slice(0, 500);
  if (!question) throw new Error('질문을 입력해 주세요.');
  const history = (input.history ?? []).slice(-3);
  const found = searchHelp([...history.map((h) => h.question), question].join('\n'), input.tab);
  const fallback = excerpt(found);
  const agent = helper(input.officeId);
  if (!useAI || store.provider === 'mock' || !agent) return { answer: fallback, sources: found, ai: false };

  const office = input.officeId ? store.data.offices.find((o) => o.id === input.officeId) : undefined;
  const prompt = [
    '지금은 업무가 아니라, 이 앱(AI 에이전트 오피스)의 사용법을 묻는 사용자에게 답하는 도움말 담당이에요.',
    '규칙:',
    '- 아래 [도움말]과 [현재 설정]만 근거로 한국어로 짧고 정확하게 답해요. 버튼·탭 이름은 화면에 쓰인 그대로 써요.',
    '- 도움말에 없는 내용은 지어내지 말고 "도움말에 없는 내용이에요"라고 말한 뒤, 확인할 수 있는 곳을 알려 줘요.',
    '- 순서가 있으면 번호 목록으로 써요. 마크다운 제목(#)은 쓰지 마요.',
    '- [현재 설정]을 보고 사용자가 지금 막힐 부분(예: 명령 MCP가 꺼져 있음)이 있으면 먼저 알려 줘요.',
    '- 비밀번호, API 키, 토큰 값을 채팅에 쓰라고 하지 마요.',
    '',
    `[보고 있는 화면] ${HELP_TABS[input.tab ?? ''] ?? '알 수 없음'}${office ? ` · ${office.name}` : ''}`,
    `[현재 설정]\n${appState()}`,
    '',
    '[도움말]',
    ...(found.length ? found.map((s) => `### ${s.source} · ${s.title}\n${s.text}`) : ['(관련 부분을 찾지 못함)']),
    ...(history.length ? ['', '[이전 대화]', ...history.map((h) => `사용자: ${h.question}\n답: ${h.answer.slice(0, 600)}`)] : []),
    '',
    `[질문] ${question}`,
  ].join('\n');
  try {
    const answer = await callAI(agent, null, 'help', prompt, () => fallback);
    return { answer: answer.trim() || fallback, sources: found, ai: true };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return { answer: `AI 답변을 받지 못해서 도움말 원문을 보여 드려요. (${why})\n\n${fallback}`, sources: found, ai: false };
  }
}
