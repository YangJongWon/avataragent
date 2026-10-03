import { REVIEWABLE, type DeckSpec, type DesignKind, type DesignRecord, type DesignReview, type DocSpec, type WorkbookSpec } from '../../shared/design.ts';
import type { Agent, Task } from '../../shared/types.ts';
import { parseJson } from '../ai.ts';
import { config } from '../config.ts';
import { callAI } from '../orchestrator.ts';
import { store } from '../store.ts';
import { fitDeck, lintDoc } from './fit.ts';
import { plainDoc, renderDeck, renderDoc, reportOf } from './index.ts';
import { designPrompt, revisePrompt, reviewPrompt } from './prompts.ts';
import { findSoffice, RENDERER_HINT, toPdf } from './render.ts';
import { mockWorkbook, sanitizeWorkbook } from './sheet.ts';
import { deckFromDoc, enrichDoc, obj, sanitizeDeck, sanitizeDoc, str, tablesOf } from './spec.ts';

type Spec = DocSpec | DeckSpec | WorkbookSpec;

let renderPdf: (file: Buffer, ext: 'pptx' | 'docx') => Promise<Buffer> = toPdf;
let rendererOverride = false;

/** Tests swap the LibreOffice step for a stub. */
export function setPdfRenderer(fn: typeof toPdf | null) {
  renderPdf = fn ?? toPdf;
  rendererOverride = fn !== null;
}

export const canReview = () => rendererOverride || findSoffice() !== null;

export function exportCapabilities() {
  const visualReview = canReview();
  return { visualReview, hint: visualReview ? '' : RENDERER_HINT, rounds: config.designReviewRounds };
}

const designing = new Set<string>();

const firstAgent = (task: Task, ...roles: Agent['role'][]) => {
  for (const role of roles) {
    const agent = store.data.agents.find((a) => a.officeId === task.officeId && a.role === role);
    if (agent) return agent;
  }
  throw new Error('이 사무실에 디자인을 맡을 직원이 없어요.');
};

const stripPlan = (deck: DeckSpec): DeckSpec => ({ ...deck, slides: fitDeck(deck).slides.map(({ pt: _pt, titlePt: _t, rows: _r, ...s }) => s) });

/** What the mock designer does when told to fix things: split what overflows and break walls of text into lists. */
function mockRevise(kind: 'doc' | 'deck', spec: Spec): Spec {
  if (kind === 'deck') return stripPlan(spec as DeckSpec);
  const doc = structuredClone(spec as DocSpec);
  doc.blocks = doc.blocks.map((b) => {
    if (b.type !== 'paragraph' || b.text.length <= 600) return b;
    const items = b.text.split(/(?<=[.!?。다요])\s+/).filter(Boolean);
    return items.length > 1 ? { type: 'bullets', items } : b;
  });
  return doc;
}

function parseIssues(text: string) {
  const raw = parseJson<{ ok?: boolean; issues?: unknown[] }>(text, {});
  return (Array.isArray(raw.issues) ? raw.issues : [])
    .map((i) => {
      if (typeof i === 'string') return str(i, 200);
      const o = obj(i);
      const page = Number(o.page);
      const problem = str(o.problem, 160);
      const fix = str(o.fix, 120);
      if (!problem) return '';
      return `${Number.isInteger(page) && page > 0 ? `${page}쪽: ` : ''}${problem}${fix ? ` → ${fix}` : ''}`;
    })
    .filter(Boolean)
    .slice(0, 12);
}

/**
 * The writer lays the finished report out; with `review`, the file is rendered to PDF and the office's reviewer
 * looks at the pages, the writer fixes what was flagged, and that repeats up to DESIGN_REVIEW_ROUNDS times.
 */
export async function designReport(taskId: string, kind: DesignKind, opts: { review?: boolean } = {}) {
  const key = `${taskId}:${kind}`;
  if (designing.has(key)) throw new Error('이미 디자인하는 중이에요. 잠시만 기다려 주세요.');
  const review = Boolean(opts.review);
  if (review && !REVIEWABLE.includes(kind)) throw new Error('화면 검수는 문서와 슬라이드 디자인에서만 할 수 있어요.');
  if (review && !canReview()) throw new Error(`화면 검수에 쓸 LibreOffice가 없어요. ${RENDERER_HINT}`);
  designing.add(key);
  try {
    const task = store.task(taskId);
    const office = store.office(task.officeId);
    const { draft, markdown } = reportOf(task);
    const plain = plainDoc(task, office);
    if (kind === 'sheet' && !tablesOf(plain).length) throw new Error('보고서에 표가 없어서 엑셀 디자인을 할 게 없어요. 기본 Excel로 받아 주세요.');
    const designer = store.data.agents.find((a) => a.id === draft.agentId && a.officeId === task.officeId) ?? firstAgent(task, 'writer', 'manager');
    const source = `${task.title}\n${markdown}`;
    const base = designPrompt(kind, markdown, task.title, plain);

    const parse = (text: string): { spec: Spec; dropped: number } => {
      const raw = parseJson<Record<string, unknown>>(text, {});
      if (kind === 'sheet') return { spec: sanitizeWorkbook(raw, plain), dropped: 0 };
      return kind === 'doc' ? sanitizeDoc(raw, source, task.title, plain.subtitle) : sanitizeDeck(raw, source, task.title, plain.subtitle);
    };
    const empty = (spec: Spec) => ('blocks' in spec ? !spec.blocks.length : 'slides' in spec ? !spec.slides.length : !spec.sheets.length);
    const mock = () => {
      if (kind === 'sheet') return JSON.stringify(mockWorkbook(plain));
      const doc = enrichDoc(plain);
      return JSON.stringify(kind === 'doc' ? doc : deckFromDoc(doc));
    };

    let { spec, dropped } = parse(await callAI(designer, task, 'design', base, mock, true));
    if (empty(spec)) throw new Error('AI 디자인 결과를 읽지 못했어요. 다시 시도하거나 기본 디자인으로 내보내 주세요.');

    let result: DesignReview | undefined;
    if (review && (kind === 'doc' || kind === 'deck')) {
      const reviewer = firstAgent(task, 'reviewer', 'manager');
      const fixed: string[] = [];
      let issues: string[] = [];
      let rounds = 0;
      for (let round = 1; round <= config.designReviewRounds; round++) {
        rounds = round;
        const file = kind === 'deck' ? await renderDeck(spec as DeckSpec, office) : await renderDoc(spec as DocSpec, office);
        const pdf = await renderPdf(file, kind === 'deck' ? 'pptx' : 'docx');
        const notes = kind === 'deck' ? fitDeck(spec as DeckSpec).issues : lintDoc(spec as DocSpec);
        const mockReview = () => JSON.stringify({ ok: notes.length === 0, issues: notes.map((problem) => ({ problem })) });
        issues = parseIssues(
          await callAI(reviewer, task, 'design_review', reviewPrompt(kind, notes), mockReview, true, [{ mime: 'application/pdf', name: `${kind}.pdf`, data: pdf }]),
        );
        if (!issues.length || round === config.designReviewRounds) break;
        const before = spec;
        const revised = parse(await callAI(designer, task, 'design', revisePrompt(kind, base, before, issues), () => JSON.stringify(mockRevise(kind, before)), true));
        if (empty(revised.spec)) break;
        fixed.push(...issues);
        ({ spec, dropped } = revised);
      }
      result = { rounds, issues, fixed, passed: issues.length === 0 };
    }

    const record: DesignRecord<Spec> = { draftVersion: draft.version, spec, dropped, review: result, createdAt: new Date().toISOString() };
    store.updateTask(taskId, (t) => {
      t.designs = { ...t.designs, [kind]: record };
    });
    store.emit('task.designed', {
      taskId,
      agentId: designer.id,
      payload: { kind, dropped, version: draft.version, reviewed: Boolean(result), passed: result?.passed ?? null, rounds: result?.rounds ?? 0 },
    });
    return { dropped, review: result };
  } finally {
    designing.delete(key);
  }
}
