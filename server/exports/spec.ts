import { marked, type Token, type Tokens } from 'marked';
import { isPaletteId, type Block, type CalloutTone, type ChartData, type CompareSide, type DeckSpec, type DesignStyle, type DocSpec, type Kpi, type Slide, type TableData } from '../../shared/design.ts';

const SUMMARY_RE = /^(핵심\s*)?(요약|summary|tl;?dr)/i;
const SOURCES_RE = /^(출처|참고(\s*자료|\s*문헌)?|sources?|references?)/i;
const CONCLUSION_RE = /^(결론|권고|제언|추천|다음\s*단계|conclusion|recommendation)/i;

export function stripInline(text: string) {
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_m, label: string, url: string) => (label === url ? url : `${label} (${url})`))
    .replace(/(\*\*|__|~~)(.+?)\1/g, '$2')
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?:;]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!|])/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .trim();
}

const listItems = (list: Tokens.List) =>
  list.items.flatMap((item) =>
    item.text
      .split('\n')
      .map((line) => stripInline(line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')))
      .filter(Boolean),
  );

/** The report as written, without any AI layout. Tables and lists keep their exact text. */
export function docFromMarkdown(markdown: string, fallbackTitle: string, subtitle: string): DocSpec {
  const doc: DocSpec = { title: '', subtitle, summary: [], blocks: [], sources: [] };
  let mode: 'body' | 'summary' | 'sources' = 'body';
  let section = '';
  const tokens = marked.lexer(markdown);
  for (const token of tokens as Token[]) {
    switch (token.type) {
      case 'heading': {
        const text = stripInline(token.text);
        if (token.depth === 1 && !doc.title) {
          doc.title = text;
          continue;
        }
        mode = SUMMARY_RE.test(text) ? 'summary' : SOURCES_RE.test(text) ? 'sources' : 'body';
        if (mode !== 'body') continue;
        section = text;
        doc.blocks.push(token.depth <= 2 ? { type: 'heading', text } : { type: 'subheading', text });
        continue;
      }
      case 'paragraph':
      case 'text': {
        const text = stripInline(token.text.replace(/\n/g, ' '));
        if (!text) continue;
        if (mode === 'summary') doc.summary.push(text);
        else if (mode === 'sources') doc.sources.push(text);
        else doc.blocks.push({ type: 'paragraph', text });
        continue;
      }
      case 'list': {
        const items = listItems(token as Tokens.List);
        if (mode === 'summary') doc.summary.push(...items);
        else if (mode === 'sources') doc.sources.push(...items);
        else if (items.length) doc.blocks.push({ type: 'bullets', items, ordered: (token as Tokens.List).ordered || undefined });
        continue;
      }
      case 'table': {
        const t = token as Tokens.Table;
        const table: TableData = {
          title: section || undefined,
          columns: t.header.map((c) => stripInline(c.text)),
          rows: t.rows.map((r) => r.map((c) => stripInline(c.text))),
        };
        if (mode === 'body') doc.blocks.push({ type: 'table', table });
        continue;
      }
      case 'blockquote': {
        const text = stripInline(token.text.replace(/\n/g, ' '));
        if (text && mode === 'body') doc.blocks.push({ type: 'quote', text });
        continue;
      }
      case 'code': {
        const text = token.text.trim();
        if (text && mode === 'body') doc.blocks.push({ type: 'paragraph', text });
        continue;
      }
    }
  }
  doc.title ||= fallbackTitle;
  return doc;
}

export const tablesOf = (doc: DocSpec) => doc.blocks.flatMap((b) => (b.type === 'table' ? [b.table] : []));

/** A table's title repeats the heading right above it when it came from the markdown section. */
export function captionOf(title: string | undefined, prev: Block | undefined) {
  if (!title) return '';
  return (prev?.type === 'heading' || prev?.type === 'subheading') && prev.text === title ? '' : title;
}

const chunk = <T>(items: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const MAX_SLIDES = 20;
const BULLETS_PER_SLIDE = 6;
const ROWS_PER_SLIDE = 8;

/** One idea per slide: lists are split, every table, chart and card group gets its own slide. */
export function deckFromDoc(doc: DocSpec): DeckSpec {
  const slides: Slide[] = [];
  if (doc.summary.length) {
    for (const items of chunk(doc.summary, BULLETS_PER_SLIDE)) slides.push({ title: '핵심 요약', block: { type: 'bullets', items } });
  }
  let section = doc.title;
  let pending: string[] = [];
  const flush = () => {
    for (const items of chunk(pending, BULLETS_PER_SLIDE)) slides.push({ title: section, block: { type: 'bullets', items } });
    pending = [];
  };
  for (const block of doc.blocks) {
    switch (block.type) {
      case 'heading':
        flush();
        section = block.text;
        break;
      case 'subheading':
        pending.push(`▸ ${block.text}`);
        break;
      case 'paragraph':
        pending.push(block.text.length > 180 ? `${block.text.slice(0, 177)}…` : block.text);
        break;
      case 'bullets':
        pending.push(...block.items);
        break;
      case 'table': {
        flush();
        const parts = chunk(block.table.rows, ROWS_PER_SLIDE);
        parts.forEach((rows, i) =>
          slides.push({
            title: parts.length > 1 ? `${section} (${i + 1}/${parts.length})` : section,
            block: { type: 'table', table: { ...block.table, rows } },
          }),
        );
        break;
      }
      default:
        flush();
        slides.push({ title: block.type === 'kpis' && section === doc.title ? '핵심 지표' : section, block });
    }
  }
  flush();
  return { title: doc.title, subtitle: doc.subtitle, slides: slides.slice(0, MAX_SLIDES), sources: doc.sources };
}

const NUMBER_RE = /\d+(?:[.,]\d+)*/g;
const normalizeNumber = (n: string) => n.replace(/,/g, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');

export function numbersIn(text: string) {
  return (text.match(NUMBER_RE) ?? []).map(normalizeNumber);
}

/** Every number the AI shows must already be in the report; tiny counts are allowed. */
export function groundingCheck(source: string) {
  const known = new Set(numbersIn(source));
  const fine = (n: string) => known.has(n) || (/^\d+$/.test(n) && Number(n) <= 10);
  const check = (value: unknown): boolean => {
    if (typeof value === 'number') return fine(normalizeNumber(String(Math.abs(value))));
    if (typeof value === 'string') return numbersIn(value).every(fine);
    if (Array.isArray(value)) return value.every(check);
    if (value && typeof value === 'object') return Object.values(value).every(check);
    return true;
  };
  return check;
}

export function parseNumber(cell: string): number | null {
  const s = cell.replace(/[₩$,\s]|원|만원|억원|%|개|건|명|배|시간|분|일/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
export const strs = (v: unknown, maxItems: number, maxLen: number) =>
  (Array.isArray(v) ? v : []).map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems);
export const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function sanitizeTable(v: unknown): TableData | null {
  const t = obj(v);
  const columns = strs(t.columns, 10, 60);
  if (!columns.length) return null;
  const rows = (Array.isArray(t.rows) ? t.rows : [])
    .slice(0, 60)
    .map((r) => columns.map((_, i) => (Array.isArray(r) ? str(typeof r[i] === 'number' ? String(r[i]) : r[i], 200) : '')));
  if (!rows.length) return null;
  return { title: str(t.title, 80) || undefined, columns, rows };
}

function sanitizeChart(v: unknown): ChartData | null {
  const c = obj(v);
  const kind = c.kind === 'line' || c.kind === 'pie' ? c.kind : 'bar';
  const labels = strs(c.labels, 12, 40);
  const series = (Array.isArray(c.series) ? c.series : [])
    .slice(0, kind === 'pie' ? 1 : 4)
    .map((s) => {
      const o = obj(s);
      const values = (Array.isArray(o.values) ? o.values : []).map(Number);
      return { name: str(o.name, 40) || '값', values };
    })
    .filter((s) => s.values.length === labels.length && s.values.every((n) => Number.isFinite(n) && (kind !== 'pie' || n >= 0)));
  if (labels.length < 2 || !series.length) return null;
  return { kind, title: str(c.title, 80), labels, series, unit: str(c.unit, 10) || undefined };
}

const side = (v: unknown): CompareSide => ({ title: str(obj(v).title, 60), items: strs(obj(v).items, 8, 160) });

function sanitizeBlock(v: unknown): Block | null {
  const b = obj(v);
  switch (b.type) {
    case 'heading':
    case 'subheading': {
      const text = str(b.text, 100);
      return text ? { type: b.type, text } : null;
    }
    case 'paragraph': {
      const text = str(b.text, 2000);
      return text ? { type: 'paragraph', text } : null;
    }
    case 'bullets': {
      const items = strs(b.items, 12, 300);
      return items.length ? { type: 'bullets', items, ordered: b.ordered === true || undefined } : null;
    }
    case 'kpis': {
      const items: Kpi[] = (Array.isArray(b.items) ? b.items : [])
        .slice(0, 6)
        .map((k) => ({ label: str(obj(k).label, 40), value: str(obj(k).value, 24), note: str(obj(k).note, 80) || undefined }))
        .filter((k) => k.label && k.value);
      return items.length ? { type: 'kpis', items } : null;
    }
    case 'callout': {
      const text = str(b.text, 600);
      const tone: CalloutTone = b.tone === 'good' || b.tone === 'warn' ? b.tone : 'info';
      return text ? { type: 'callout', tone, title: str(b.title, 60), text } : null;
    }
    case 'quote': {
      const text = str(b.text, 400);
      return text ? { type: 'quote', text, by: str(b.by, 60) || undefined } : null;
    }
    case 'table': {
      const table = sanitizeTable(b.table);
      return table ? { type: 'table', table } : null;
    }
    case 'chart': {
      const chart = sanitizeChart(b.chart);
      return chart ? { type: 'chart', chart } : null;
    }
    case 'timeline': {
      const items = (Array.isArray(b.items) ? b.items : [])
        .slice(0, 10)
        .map((i) => ({ when: str(obj(i).when, 30), what: str(obj(i).what, 160) }))
        .filter((i) => i.when && i.what);
      return items.length >= 2 ? { type: 'timeline', items } : null;
    }
    case 'compare': {
      const left = side(b.left);
      const right = side(b.right);
      return left.items.length && right.items.length ? { type: 'compare', left, right } : null;
    }
    default:
      return null;
  }
}

export interface Sanitized<T> {
  spec: T;
  dropped: number;
}

export function sanitizeDoc(raw: unknown, source: string, fallbackTitle: string, subtitle: string): Sanitized<DocSpec> {
  const r = obj(raw);
  const ok = groundingCheck(source);
  let dropped = 0;
  const keep = <T>(x: T | null) => {
    if (x === null) return false;
    if (ok(x)) return true;
    dropped++;
    return false;
  };
  const blocks = (Array.isArray(r.blocks) ? r.blocks : []).slice(0, 80).map(sanitizeBlock).filter(keep) as Block[];
  return {
    spec: {
      title: str(r.title, 120) || fallbackTitle,
      subtitle: str(r.subtitle, 120) || subtitle,
      summary: strs(r.summary, 8, 300).filter(keep),
      blocks,
      sources: strs(r.sources, 30, 400),
      style: sanitizeStyle(r.style),
    },
    dropped,
  };
}

export function sanitizeStyle(v: unknown): DesignStyle | undefined {
  const s = obj(v);
  const style: DesignStyle = {};
  if (isPaletteId(s.palette)) style.palette = s.palette;
  if (s.fonts === 'modern' || s.fonts === 'classic') style.fonts = s.fonts;
  return Object.keys(style).length ? style : undefined;
}

export function sanitizeDeck(raw: unknown, source: string, fallbackTitle: string, subtitle: string): Sanitized<DeckSpec> {
  const r = obj(raw);
  const ok = groundingCheck(source);
  let dropped = 0;
  const slides: Slide[] = [];
  for (const s of (Array.isArray(r.slides) ? r.slides : []).slice(0, MAX_SLIDES)) {
    const o = obj(s);
    const title = str(o.title, 80);
    let block = sanitizeBlock(o.block) ?? undefined;
    if (block?.type === 'heading' || block?.type === 'subheading' || block?.type === 'paragraph') {
      block = { type: 'bullets', items: [block.text] };
    }
    if (block && !ok(block)) {
      dropped++;
      continue;
    }
    if (!title && !block) continue;
    slides.push({ title, block, notes: str(o.notes, 500) || undefined });
  }
  return {
    spec: {
      title: str(r.title, 120) || fallbackTitle,
      subtitle: str(r.subtitle, 120) || subtitle,
      slides,
      sources: strs(r.sources, 30, 400),
      style: sanitizeStyle(r.style),
    },
    dropped,
  };
}

const VALUE_RE = /[₩$]?\d[\d,.]*\s*(?:%|만원|억원|억|원|개|건|명|배|시간|분|일|점)?/;

/** What the mock designer does: cards from numeric summary lines, charts from numeric tables, a highlighted conclusion. */
export function enrichDoc(base: DocSpec): DocSpec {
  const doc: DocSpec = structuredClone(base);
  const kpis: Kpi[] = [];
  for (const line of doc.summary) {
    const m = line.match(VALUE_RE);
    if (!m || kpis.length >= 4) continue;
    const before = line.slice(0, m.index).replace(/[:\-–·,]\s*$/, '').trim();
    const label = before || line.slice(m.index! + m[0].length).replace(/^\s*(으로|로|의|이|가|은|는)\s*/, '').trim();
    kpis.push({ label: label.length > 28 ? `${label.slice(0, 27)}…` : label || '핵심 수치', value: m[0].trim() });
  }
  const blocks: Block[] = kpis.length >= 2 ? [{ type: 'kpis', items: kpis }] : [];
  let section = '';
  let calloutDone = false;
  for (const block of doc.blocks) {
    if (block.type === 'heading') section = block.text;
    if (block.type === 'paragraph' && !calloutDone && CONCLUSION_RE.test(section)) {
      blocks.push({ type: 'callout', tone: 'good', title: '', text: block.text });
      calloutDone = true;
      continue;
    }
    blocks.push(block);
    if (block.type !== 'table') continue;
    const { columns, rows } = block.table;
    const col = columns.findIndex((_, i) => i > 0 && rows.length >= 2 && rows.every((r) => parseNumber(r[i] ?? '') !== null));
    if (col < 0 || rows.length > 12) continue;
    blocks.push({
      type: 'chart',
      chart: {
        kind: 'bar',
        title: columns[col],
        labels: rows.map((r) => r[0] ?? ''),
        series: [{ name: columns[col], values: rows.map((r) => parseNumber(r[col])!) }],
      },
    });
  }
  doc.blocks = blocks;
  return doc;
}
