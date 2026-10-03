import ExcelJS from 'exceljs';
import type { DocSpec, TableData } from '../../shared/design.ts';
import { parseNumber } from './spec.ts';
import type { Theme } from './theme.ts';

const tablesOf = (doc: DocSpec) => doc.blocks.flatMap((b) => (b.type === 'table' ? [b.table] : []));

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

function cellValue(raw: string): { value: string | number; numFmt?: string } {
  const n = parseNumber(raw);
  if (n === null) return { value: raw };
  if (raw.includes('%')) return { value: n / 100, numFmt: Number.isInteger(n) ? '0%' : '0.0%' };
  if (/₩|원/.test(raw)) return { value: n, numFmt: '#,##0"원"' };
  return { value: n, numFmt: Number.isInteger(n) ? '#,##0' : '#,##0.##' };
}

function sheetName(title: string, used: Set<string>) {
  const base = title.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || '표';
  let name = base;
  for (let i = 2; used.has(name); i++) name = `${base.slice(0, 26)} ${i}`;
  used.add(name);
  return name;
}

function addTableSheet(wb: ExcelJS.Workbook, t: TableData, name: string, theme: Theme) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  const header = ws.addRow(t.columns);
  header.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: theme.font };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(theme.accent) } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  header.height = 22;
  for (const r of t.rows) {
    const row = ws.addRow([]);
    t.columns.forEach((_, i) => {
      const cell = row.getCell(i + 1);
      const { value, numFmt } = cellValue(r[i] ?? '');
      cell.value = value;
      if (numFmt) cell.numFmt = numFmt;
      cell.font = { name: theme.font };
      cell.alignment = { vertical: 'top', wrapText: typeof value === 'string' };
    });
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: t.columns.length } };
  ws.columns.forEach((col, i) => {
    const longest = Math.max(t.columns[i]?.length ?? 0, ...t.rows.map((r) => (r[i] ?? '').length));
    col.width = Math.min(60, Math.max(10, longest * 1.6 + 2));
  });
}

export async function renderXlsx(doc: DocSpec, theme: Theme): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AI 에이전트 오피스';
  wb.created = new Date();
  const used = new Set<string>();

  const cover = wb.addWorksheet(sheetName('요약', used));
  cover.columns = [{ width: 18 }, { width: 100 }];
  const title = cover.addRow([doc.title]);
  title.font = { bold: true, size: 16, name: theme.font, color: { argb: argb(theme.accent) } };
  cover.mergeCells(1, 1, 1, 2);
  cover.addRow([doc.subtitle]).font = { color: { argb: argb(theme.muted) }, name: theme.font };
  cover.addRow([]);
  const head = cover.addRow(['구분', '내용']);
  head.eachCell((c) => {
    c.font = { bold: true, name: theme.font };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(theme.soft) } };
  });
  for (const r of outline(doc)) {
    const row = cover.addRow(r);
    row.alignment = { vertical: 'top', wrapText: true };
    row.font = { name: theme.font };
  }

  tablesOf(doc).forEach((t, i) => addTableSheet(wb, t, sheetName(t.title ?? `표 ${i + 1}`, used), theme));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
