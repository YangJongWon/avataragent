import type { DocSpec, SheetPlan, TableData, TotalFn, WorkbookSpec } from '../../shared/design.ts';
import { obj, parseNumber, sanitizeStyle, str, strs, tablesOf } from './spec.ts';

export type ColumnKind = 'text' | 'number' | 'percent' | 'money';

const MONEY_RE = /원|₩|\$|비용|금액|매출|예산|가격|단가|이익|손익/;

export function columnKinds(t: TableData): ColumnKind[] {
  return t.columns.map((name, i) => {
    const cells = t.rows.map((r) => r[i] ?? '').filter((c) => c.trim());
    if (!cells.length || !cells.every((c) => parseNumber(c) !== null)) return 'text';
    if (cells.some((c) => c.includes('%'))) return 'percent';
    if (MONEY_RE.test(name) || cells.some((c) => /원|₩/.test(c))) return 'money';
    return 'number';
  });
}

const FNS: TotalFn[] = ['sum', 'average', 'min', 'max'];

/** Keeps only steps that point at real columns; anything else would become a broken formula. */
export function sanitizeWorkbook(raw: unknown, doc: DocSpec): WorkbookSpec {
  const r = obj(raw);
  const tables = tablesOf(doc);
  const sheets: SheetPlan[] = [];
  const seen = new Set<number>();
  for (const s of (Array.isArray(r.sheets) ? r.sheets : []).slice(0, 20)) {
    const o = obj(s);
    const index = Number(o.table);
    const t = tables[index];
    if (!Number.isInteger(index) || !t || seen.has(index)) continue;
    seen.add(index);
    const kinds = columnKinds(t);
    const numeric = new Set(t.columns.filter((_, i) => kinds[i] !== 'text'));
    const plan: SheetPlan = { table: index };
    const name = str(o.name, 28);
    if (name) plan.name = name;
    const note = str(o.note, 200);
    if (note) plan.note = note;

    type Computed = NonNullable<SheetPlan['computed']>[number];
    type Highlight = NonNullable<SheetPlan['highlight']>[number];
    const computed = (Array.isArray(o.computed) ? o.computed : [])
      .slice(0, 3)
      .map((c): Computed | null => {
        const x = obj(c);
        const op = x.op === 'diff' || x.op === 'ratio' || x.op === 'share' ? x.op : null;
        const a = str(x.a, 60);
        const b = str(x.b, 60);
        const label = str(x.name, 40);
        if (!op || !label || !numeric.has(a) || t.columns.includes(label)) return null;
        if (op !== 'share' && !numeric.has(b)) return null;
        return op === 'share' ? { name: label, op, a } : { name: label, op, a, b };
      })
      .filter((c): c is Computed => c !== null);
    if (computed.length) plan.computed = computed;

    const all = new Set([...t.columns, ...computed.map((c) => c.name)]);
    const numbers = new Set([...numeric, ...computed.map((c) => c.name)]);

    const sort = obj(o.sort);
    const sortColumn = str(sort.column, 60);
    if (all.has(sortColumn)) plan.sort = { column: sortColumn, desc: sort.desc === true || undefined };

    const totals = (Array.isArray(o.totals) ? o.totals : [])
      .map((x) => ({ column: str(obj(x).column, 60), fn: obj(x).fn as TotalFn }))
      .filter((x) => numbers.has(x.column) && FNS.includes(x.fn))
      .slice(0, 8);
    if (totals.length) plan.totals = totals;

    const highlight = (Array.isArray(o.highlight) ? o.highlight : [])
      .map((x): Highlight | null => {
        const h = obj(x);
        const op = h.op === '>' || h.op === '<' || h.op === '=' ? h.op : null;
        const value = Number(h.value);
        const column = str(h.column, 60);
        if (!op || !Number.isFinite(value) || !numbers.has(column)) return null;
        return { column, op, value, tone: h.tone === 'good' ? 'good' : 'bad' };
      })
      .filter((h): h is Highlight => h !== null)
      .slice(0, 4);
    if (highlight.length) plan.highlight = highlight;

    const bars = strs(o.bars, 2, 60).filter((b) => numbers.has(b));
    if (bars.length) plan.bars = bars;
    sheets.push(plan);
  }
  return { sheets, style: sanitizeStyle(r.style) };
}

/** What the mock designer does: money is summed with data bars, other numbers averaged. */
export function mockWorkbook(doc: DocSpec): WorkbookSpec {
  const sheets = tablesOf(doc).flatMap((t, table): SheetPlan[] => {
    const kinds = columnKinds(t);
    const money = t.columns.filter((_, i) => kinds[i] === 'money');
    const other = t.columns.filter((_, i) => kinds[i] === 'number' || kinds[i] === 'percent');
    if (!money.length && !other.length) return [];
    return [
      {
        table,
        totals: [...money.map((column) => ({ column, fn: 'sum' as const })), ...other.map((column) => ({ column, fn: 'average' as const }))],
        bars: (money.length ? money : other).slice(0, 1),
      },
    ];
  });
  return { sheets };
}

export function tableGuide(doc: DocSpec) {
  return tablesOf(doc).map((t, i) => {
    const kinds = columnKinds(t);
    return `표 ${i} "${t.title ?? ''}" (${t.rows.length}행): ${t.columns.map((c, j) => `${c}[${kinds[j] === 'text' ? '글자' : '숫자'}]`).join(', ')}`;
  });
}
