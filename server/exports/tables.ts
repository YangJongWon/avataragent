import ExcelJS from 'exceljs';
import type { DocSpec, SheetPlan, TableData, TotalFn, WorkbookSpec } from '../../shared/design.ts';
import { columnKinds, type ColumnKind } from './sheet.ts';
import { parseNumber, tablesOf } from './spec.ts';
import type { Theme } from './theme.ts';

/** Section/content rows for reports that have no table. */
function outline(doc: DocSpec): string[][] {
  const rows: string[][] = [];
  let section = '개요';
  for (const s of doc.summary) rows.push(['요약', s]);
  for (const b of doc.blocks) {
    if (b.type === 'heading') section = b.text;
    else if (b.type === 'subheading') rows.push([section, `▸ ${b.text}`]);
    else if (b.type === 'paragraph' || b.type === 'quote') rows.push([section, b.text]);
    else if (b.type === 'bullets') for (const item of b.items) rows.push([section, item]);
  }
  for (const s of doc.sources) rows.push(['출처', s]);
  return rows;
}

const csvCell = (v: string) => {
  const safe = /^[=+\-@\t\r]/.test(v) && parseNumber(v) === null ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** UTF-8 with BOM so Excel on Windows opens Korean text correctly. */
export function renderCsv(doc: DocSpec): Buffer {
  const tables = tablesOf(doc);
  const lines: string[] = [];
  const add = (row: string[]) => lines.push(row.map(csvCell).join(','));
  if (!tables.length) {
    add(['구분', '내용']);
    for (const r of outline(doc)) add(r);
  }
  tables.forEach((t, i) => {
    if (tables.length > 1) {
      if (i) lines.push('');
      add([t.title ?? `표 ${i + 1}`]);
    }
    add(t.columns);
    for (const r of t.rows) add(r);
  });
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}

const argb = (hex: string) => `FF${hex}`;
const solid = (hex: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } });
const ZEBRA = 'F6F7F9';
const LINE = 'E5E7EB';

export const colLetter = (n: number) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

function formatOf(kind: ColumnKind, sample: string) {
  if (kind === 'percent') return '0.0%';
  if (kind === 'money') return sample.includes('₩') ? '₩#,##0' : /원/.test(sample) ? '#,##0"원"' : '#,##0';
  if (kind === 'number') return '#,##0.##';
  return undefined;
}

function valueOf(kind: ColumnKind, raw: string): string | number | null {
  if (kind === 'text') return raw;
  const n = parseNumber(raw);
  if (n === null) return raw.trim() ? raw : null;
  return kind === 'percent' ? n / 100 : n;
}

const TOTAL_LABEL: Record<TotalFn, string> = { sum: '합계', average: '평균', min: '최소', max: '최대' };
const FN_NAME: Record<TotalFn, string> = { sum: 'SUM', average: 'AVERAGE', min: 'MIN', max: 'MAX' };

function aggregate(fn: TotalFn, values: number[]) {
  if (!values.length) return 0;
  if (fn === 'sum') return values.reduce((a, b) => a + b, 0);
  if (fn === 'average') return values.reduce((a, b) => a + b, 0) / values.length;
  return fn === 'min' ? Math.min(...values) : Math.max(...values);
}

const textWidth = (s: string) => [...s].reduce((w, ch) => w + (/[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(ch) ? 2 : 1.1), 0);

interface Column {
  name: string;
  kind: ColumnKind;
  numFmt?: string;
  values: (string | number | null)[];
  formula?: (row: number) => string;
}

function sheetName(title: string, used: Set<string>) {
  const base = title.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || '표';
  let name = base;
  for (let i = 2; used.has(name); i++) name = `${base.slice(0, 26)} ${i}`;
  used.add(name);
  return name;
}

function addTableSheet(wb: ExcelJS.Workbook, t: TableData, name: string, theme: Theme, plan?: SheetPlan) {
  const kinds = columnKinds(t);
  let order = t.rows.map((_, i) => i);
  const columns: Column[] = t.columns.map((c, i) => ({
    name: c,
    kind: kinds[i],
    numFmt: formatOf(kinds[i], t.rows.map((r) => r[i] ?? '').find(Boolean) ?? ''),
    values: t.rows.map((r) => valueOf(kinds[i], r[i] ?? '')),
  }));
  const index = (n: string) => columns.findIndex((c) => c.name === n);
  const first = 2;
  const last = first + t.rows.length - 1;

  for (const c of plan?.computed ?? []) {
    const a = columns[index(c.a)];
    const b = c.b ? columns[index(c.b)] : undefined;
    const A = colLetter(index(c.a) + 1);
    const B = c.b ? colLetter(index(c.b) + 1) : '';
    const num = (v: unknown) => (typeof v === 'number' ? v : 0);
    const total = a.values.reduce<number>((s, v) => s + num(v), 0);
    const values = a.values.map((v, i) => {
      if (c.op === 'diff') return num(v) - num(b!.values[i]);
      if (c.op === 'ratio') return num(b!.values[i]) ? num(v) / num(b!.values[i]) : null;
      return total ? num(v) / total : null;
    });
    const formula =
      c.op === 'diff'
        ? (r: number) => `${A}${r}-${B}${r}`
        : c.op === 'ratio'
          ? (r: number) => `IF(${B}${r}=0,"",${A}${r}/${B}${r})`
          : (r: number) => `IF(SUM(${A}$${first}:${A}$${last})=0,"",${A}${r}/SUM(${A}$${first}:${A}$${last}))`;
    columns.push({ name: c.name, kind: c.op === 'diff' ? a.kind : 'percent', numFmt: c.op === 'diff' ? a.numFmt : '0.0%', values, formula });
  }

  if (plan?.sort) {
    const s = columns[index(plan.sort.column)];
    const dir = plan.sort.desc ? -1 : 1;
    order = [...order].sort((x, y) => {
      const a = s.values[x];
      const b = s.values[y];
      if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir;
      return String(a ?? '').localeCompare(String(b ?? ''), 'ko') * dir;
    });
  }

  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  const header = ws.addRow(columns.map((c) => c.name));
  header.height = 24;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: theme.font };
    cell.fill = solid(theme.accent);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  order.forEach((src, i) => {
    const r = first + i;
    const row = ws.getRow(r);
    columns.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      const value = c.values[src];
      cell.value = c.formula ? { formula: c.formula(r), result: value ?? '' } : value;
      if (c.numFmt) cell.numFmt = c.numFmt;
      cell.font = { name: theme.font };
      cell.alignment = { vertical: 'top', wrapText: c.kind === 'text', horizontal: c.kind === 'text' ? 'left' : 'right' };
      cell.border = { bottom: { style: 'thin', color: { argb: argb(LINE) } } };
      if (i % 2 === 1) cell.fill = solid(ZEBRA);
    });
  });

  if (plan?.totals?.length && t.rows.length) {
    const r = last + 1;
    const row = ws.getRow(r);
    const fns = new Set(plan.totals.map((x) => x.fn));
    const labelCol = plan.totals.some((x) => index(x.column) === 0) ? -1 : 0;
    if (labelCol === 0) row.getCell(1).value = fns.size === 1 ? TOTAL_LABEL[plan.totals[0].fn] : '요약';
    for (const x of plan.totals) {
      const ci = index(x.column);
      const L = colLetter(ci + 1);
      const nums = columns[ci].values.filter((v): v is number => typeof v === 'number');
      const cell = row.getCell(ci + 1);
      cell.value = { formula: `${FN_NAME[x.fn]}(${L}${first}:${L}${last})`, result: aggregate(x.fn, nums) };
      if (columns[ci].numFmt) cell.numFmt = columns[ci].numFmt!;
      if (fns.size > 1) cell.note = TOTAL_LABEL[x.fn];
    }
    columns.forEach((_, ci) => {
      const cell = row.getCell(ci + 1);
      cell.font = { bold: true, name: theme.font };
      cell.fill = solid(theme.soft);
      cell.border = { top: { style: 'medium', color: { argb: argb(theme.accent) } } };
      cell.alignment = { horizontal: ci === 0 ? 'left' : 'right' };
    });
  }

  const range = (ci: number) => `${colLetter(ci + 1)}${first}:${colLetter(ci + 1)}${last}`;
  for (const h of plan?.highlight ?? []) {
    const ci = index(h.column);
    const value = columns[ci].kind === 'percent' && Math.abs(h.value) > 1 ? h.value / 100 : h.value;
    const [bg, fg] = h.tone === 'good' ? ['E3F4E8', '1E6B3A'] : ['FDE2E2', '9B1C1C'];
    ws.addConditionalFormatting({
      ref: range(ci),
      rules: [
        {
          type: 'cellIs',
          priority: 1,
          operator: h.op === '>' ? 'greaterThan' : h.op === '<' ? 'lessThan' : 'equal',
          formulae: [String(value)],
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: argb(bg) } }, font: { color: { argb: argb(fg) }, bold: true } },
        },
      ],
    });
  }
  for (const b of plan?.bars ?? []) {
    ws.addConditionalFormatting({
      ref: range(index(b)),
      rules: [{ type: 'dataBar', priority: 2, cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: argb(theme.chart[1] ?? theme.accent) }, gradient: false } as ExcelJS.DataBarRuleType],
    });
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  ws.columns.forEach((col, i) => {
    const c = columns[i];
    const longest = Math.max(textWidth(c.name), ...order.map((src) => textWidth(String(t.rows[src]?.[i] ?? c.values[src] ?? ''))));
    col.width = Math.min(60, Math.max(10, longest + 3));
  });
}

export async function renderXlsx(doc: DocSpec, theme: Theme, plan?: WorkbookSpec): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AI 에이전트 오피스';
  wb.created = new Date();
  const used = new Set<string>();
  const tables = tablesOf(doc);
  const plans = new Map((plan?.sheets ?? []).map((p) => [p.table, p]));

  const cover = wb.addWorksheet(sheetName('요약', used));
  cover.columns = [{ width: 18 }, { width: 100 }];
  const title = cover.addRow([doc.title]);
  title.font = { bold: true, size: 16, name: theme.headFont, color: { argb: argb(theme.accent) } };
  cover.mergeCells(1, 1, 1, 2);
  cover.addRow([doc.subtitle]).font = { color: { argb: argb(theme.muted) }, name: theme.font };
  cover.addRow([]);

  const names = tables.map((t, i) => sheetName(plans.get(i)?.name ?? t.title ?? `표 ${i + 1}`, used));
  const section = (label: string) => {
    const head = cover.addRow([label, '']);
    head.eachCell((c) => {
      c.font = { bold: true, name: theme.font };
      c.fill = solid(theme.soft);
    });
  };
  if (tables.length) {
    section('시트');
    names.forEach((n, i) => {
      const row = cover.addRow([n, plans.get(i)?.note ?? `${tables[i].rows.length}행 · ${tables[i].columns.join(', ')}`]);
      row.getCell(1).value = { text: n, hyperlink: `#'${n.replace(/'/g, "''")}'!A1` };
      row.getCell(1).font = { name: theme.font, color: { argb: argb(theme.accent) }, underline: true };
      row.getCell(2).font = { name: theme.font };
    });
    cover.addRow([]);
  }
  section('구분');
  cover.lastRow!.getCell(2).value = '내용';
  outline(doc).forEach((r, i) => {
    const row = cover.addRow(r);
    row.alignment = { vertical: 'top', wrapText: true };
    row.font = { name: theme.font };
    if (i % 2 === 1) row.eachCell((c) => (c.fill = solid(ZEBRA)));
  });

  tables.forEach((t, i) => addTableSheet(wb, t, names[i], theme, plans.get(i)));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
