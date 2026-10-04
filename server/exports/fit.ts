import type { Block, DeckSpec, DocSpec, Slide } from '../../shared/design.ts';

/** Rough glyph widths in em: Hangul/CJK are square, Latin and digits about half. Good enough to catch overflow before rendering. */
const WIDE = /[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/;

export function textWidthIn(text: string, pt: number) {
  let em = 0;
  for (const ch of text) em += WIDE.test(ch) ? 1 : ch === ' ' ? 0.3 : /[A-Z]/.test(ch) ? 0.65 : 0.55;
  return (em * pt) / 72;
}

export function linesFor(text: string, widthIn: number, pt: number) {
  return text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(textWidthIn(line, pt) / Math.max(widthIn, 0.1))), 0);
}

export const heightFor = (lines: number, pt: number, spacing = 1.25) => (lines * pt * spacing) / 72;

/** Slide geometry shared by the planner and the PowerPoint renderer (inches, 16:9 wide). */
export const SLIDE = { W: 13.333, H: 7.5, X: 0.6, TOP: 1.6, BODY_H: 5.3, get CW() { return this.W - this.X * 2; } };

export const BODY_MIN_PT = 14;

export interface PlannedSlide extends Slide {
  /** Body font size the renderer should use. */
  pt: number;
  titlePt: number;
  /** Bullet slides with few short items become numbered rows. */
  rows?: boolean;
}

export interface FitResult {
  slides: PlannedSlide[];
  issues: string[];
}

const ROW_GAP = 0.25;
const TABLE_PAD = 0.12;

export function bulletsHeight(items: string[], pt: number, width: number) {
  return items.reduce((h, t) => h + heightFor(linesFor(t, width, pt), pt) + (pt * 0.6) / 72, 0);
}

function tableRowHeight(row: string[], cols: number, pt: number) {
  const w = SLIDE.CW / cols - 0.15;
  return Math.max(...row.map((c) => heightFor(linesFor(c || ' ', w, pt), pt, 1.15))) + TABLE_PAD;
}

function titlePt(title: string) {
  for (const pt of [30, 26, 22]) if (linesFor(title, SLIDE.CW, pt) <= 2) return pt;
  return 20;
}

/**
 * Picks font sizes so every slide fits, never going under the body floor; past the floor the slide is split.
 * Issues describe what had to change, which doubles as the free first-pass review.
 */
export function fitDeck(deck: DeckSpec): FitResult {
  const issues: string[] = [];
  const out: PlannedSlide[] = [];
  const n = () => out.length + 2;

  for (const s of deck.slides) {
    const tp = titlePt(s.title);
    if (linesFor(s.title, SLIDE.CW, tp) > 2) issues.push(`슬라이드 ${n()}: 제목이 길어 두 줄을 넘어요 ("${s.title.slice(0, 20)}…")`);
    const b = s.block;
    if (!b) {
      out.push({ ...s, pt: 36, titlePt: tp });
      continue;
    }
    if (b.type === 'bullets') {
      const rowsWidth = SLIDE.CW - 0.9;
      const asRows = b.items.length <= 5 && bulletsHeight(b.items, 20, rowsWidth) + ROW_GAP * b.items.length <= SLIDE.BODY_H;
      if (asRows) {
        out.push({ ...s, pt: 20, titlePt: tp, rows: true });
        continue;
      }
      const pt = [18, 16, BODY_MIN_PT].find((p) => bulletsHeight(b.items, p, SLIDE.CW) <= SLIDE.BODY_H);
      if (pt) {
        out.push({ ...s, pt, titlePt: tp });
        continue;
      }
      const parts: string[][] = [[]];
      for (const item of b.items) {
        const cur = parts.at(-1)!;
        if (cur.length && bulletsHeight([...cur, item], BODY_MIN_PT + 2, SLIDE.CW) > SLIDE.BODY_H) parts.push([item]);
        else cur.push(item);
      }
      issues.push(`슬라이드 ${n()}: 항목 ${b.items.length}개가 한 장에 넘쳐 ${parts.length}장으로 나눴어요`);
      parts.forEach((items, i) =>
        out.push({ ...s, title: i ? `${s.title} (계속)` : s.title, block: { ...b, items }, pt: BODY_MIN_PT + 2, titlePt: tp, notes: i ? undefined : s.notes }),
      );
      continue;
    }
    if (b.type === 'table') {
      const cols = b.table.columns.length;
      const pt = b.table.rows.length <= 6 && cols <= 5 ? 18 : cols > 5 || b.table.rows.length > 10 ? 12 : 14;
      const header = tableRowHeight(b.table.columns, cols, pt);
      const parts: string[][][] = [[]];
      let h = header;
      for (const row of b.table.rows) {
        const rh = tableRowHeight(row, cols, pt);
        if (parts.at(-1)!.length && h + rh > SLIDE.BODY_H) {
          parts.push([]);
          h = header;
        }
        parts.at(-1)!.push(row);
        h += rh;
      }
      if (parts.length > 1) issues.push(`슬라이드 ${n()}: 표가 길어 ${parts.length}장으로 나눴어요`);
      parts.forEach((rows, i) =>
        out.push({
          ...s,
          title: parts.length > 1 ? `${s.title} (${i + 1}/${parts.length})` : s.title,
          block: { type: 'table', table: { ...b.table, rows } },
          pt,
          titlePt: tp,
          notes: i ? undefined : s.notes,
        }),
      );
      continue;
    }
    out.push({ ...s, pt: blockPt(b, n(), issues), titlePt: tp });
  }
  return { slides: out, issues };
}

function blockPt(b: Block, slide: number, issues: string[]) {
  switch (b.type) {
    case 'callout': {
      const pt = [24, 20, 18, 16].find((p) => heightFor(linesFor(b.text, SLIDE.CW - 2.4, p), p) <= 3.0);
      if (!pt) issues.push(`슬라이드 ${slide}: 강조 상자 글이 너무 길어요 (${b.text.length}자)`);
      return pt ?? 16;
    }
    case 'quote': {
      const pt = [32, 28, 24, 20].find((p) => heightFor(linesFor(b.text, SLIDE.CW - 4.2, p), p, 1.4) <= 3.0);
      if (!pt) issues.push(`슬라이드 ${slide}: 인용문이 너무 길어요`);
      return pt ?? 20;
    }
    case 'compare': {
      const w = (SLIDE.CW - 1.2) / 2 - 0.6;
      const pt = [18, 16, BODY_MIN_PT].find((p) => Math.max(bulletsHeight(b.left.items, p, w), bulletsHeight(b.right.items, p, w)) <= SLIDE.BODY_H - 1.4);
      if (!pt) issues.push(`슬라이드 ${slide}: 비교 항목이 많아 칸을 넘쳐요`);
      return pt ?? BODY_MIN_PT;
    }
    case 'timeline': {
      const step = SLIDE.CW / b.items.length;
      const pt = [16, 14, 12].find((p) => b.items.every((i) => heightFor(linesFor(i.what, step - 0.2, p), p) <= 2.4));
      if (!pt) issues.push(`슬라이드 ${slide}: 일정 설명이 길어 칸을 넘쳐요`);
      return pt ?? 12;
    }
    case 'kpis': {
      const w = (SLIDE.CW - 0.3 * (b.items.length - 1)) / b.items.length - 0.4;
      if (b.items.some((k) => linesFor(k.label, w, 16) > 2)) issues.push(`슬라이드 ${slide}: 숫자 카드의 이름이 길어 세 줄을 넘어요`);
      return 16;
    }
    default:
      return 16;
  }
}

/** Flow documents do not overflow, so this looks for walls of text and runaway tables instead. */
export function lintDoc(doc: DocSpec): string[] {
  const issues: string[] = [];
  let plain = 0;
  doc.blocks.forEach((b, i) => {
    if (b.type === 'paragraph' && b.text.length > 600) issues.push(`블록 ${i + 1}: 문단이 ${b.text.length}자로 너무 길어요. 나누거나 목록으로 바꾸세요`);
    if (b.type === 'table' && b.table.rows.length > 30) issues.push(`블록 ${i + 1}: 표가 ${b.table.rows.length}행이라 페이지를 여러 장 넘겨요`);
    if (b.type === 'kpis' && b.items.some((k) => k.label.length > 24)) issues.push(`블록 ${i + 1}: 숫자 카드 이름이 길어요`);
    plain = b.type === 'paragraph' || b.type === 'bullets' ? plain + 1 : 0;
    if (plain === 6) issues.push(`블록 ${i - 4}~${i + 1}: 글만 6개 이어져요. 카드·표·강조 상자를 섞으세요`);
  });
  if (!doc.blocks.some((b) => ['kpis', 'callout', 'chart', 'table', 'timeline', 'compare'].includes(b.type))) {
    issues.push('문서 전체에 시각 요소가 하나도 없어요');
  }
  return issues;
}
