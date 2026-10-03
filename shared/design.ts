/**
 * Layout the AI picks for a finished report. The server renders it; the AI never writes markup or code,
 * so every export stays inside these blocks and the team theme.
 */

export type DesignKind = 'doc' | 'deck' | 'sheet';

/** Kinds whose rendered pages a vision reviewer can check. */
export const REVIEWABLE: DesignKind[] = ['doc', 'deck'];

export type CalloutTone = 'info' | 'good' | 'warn';

export interface Kpi {
  label: string;
  value: string;
  note?: string;
}

export interface ChartData {
  kind: 'bar' | 'line' | 'pie';
  title: string;
  labels: string[];
  series: { name: string; values: number[] }[];
  unit?: string;
}

export interface TableData {
  title?: string;
  columns: string[];
  rows: string[][];
}

export interface CompareSide {
  title: string;
  items: string[];
}

export type Block =
  | { type: 'heading'; text: string }
  | { type: 'subheading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[]; ordered?: boolean }
  | { type: 'kpis'; items: Kpi[] }
  | { type: 'callout'; tone: CalloutTone; title: string; text: string }
  | { type: 'quote'; text: string; by?: string }
  | { type: 'table'; table: TableData }
  | { type: 'chart'; chart: ChartData }
  | { type: 'timeline'; items: { when: string; what: string }[] }
  | { type: 'compare'; left: CompareSide; right: CompareSide };

export interface DocSpec {
  title: string;
  subtitle: string;
  summary: string[];
  blocks: Block[];
  sources: string[];
  style?: DesignStyle;
}

export interface Slide {
  title: string;
  /** No block makes a section divider. */
  block?: Block;
  notes?: string;
}

export interface DeckSpec {
  title: string;
  subtitle: string;
  slides: Slide[];
  sources: string[];
  style?: DesignStyle;
}

/** Palettes are fixed and contrast-checked; the AI only picks one that suits the topic. */
export const PALETTES = {
  midnight: { name: '미드나잇', mood: '경영 보고·신뢰·공식 문서' },
  ocean: { name: '오션', mood: '기술·데이터·분석' },
  teal: { name: '틸', mood: '헬스케어·친환경·서비스' },
  forest: { name: '포레스트', mood: 'ESG·성장·자연' },
  sage: { name: '세이지', mood: '복지·휴식·차분함' },
  coral: { name: '코랄', mood: '마케팅·캠페인·활기' },
  terracotta: { name: '테라코타', mood: '문화·여행·라이프스타일' },
  berry: { name: '베리', mood: '브랜드·디자인·고급' },
  cherry: { name: '체리', mood: '위험·경고·긴급 의사결정' },
  charcoal: { name: '차콜', mood: '중립·법무·감사' },
} as const;

export type PaletteId = keyof typeof PALETTES;

/** modern: one sans font; classic: serif headings over a sans body. Both ship with Windows and Office. */
export type FontPair = 'modern' | 'classic';

export interface DesignStyle {
  palette?: PaletteId;
  fonts?: FontPair;
}

export const isPaletteId = (v: unknown): v is PaletteId => typeof v === 'string' && v in PALETTES;

export type TotalFn = 'sum' | 'average' | 'min' | 'max';

/** Spreadsheet intent only: the server turns it into real formulas over the report's own table. */
export interface SheetPlan {
  /** Index among the report's tables. */
  table: number;
  name?: string;
  note?: string;
  sort?: { column: string; desc?: boolean };
  computed?: { name: string; op: 'diff' | 'ratio' | 'share'; a: string; b?: string }[];
  totals?: { column: string; fn: TotalFn }[];
  highlight?: { column: string; op: '>' | '<' | '='; value: number; tone: 'good' | 'bad' }[];
  bars?: string[];
}

export interface WorkbookSpec {
  sheets: SheetPlan[];
  style?: DesignStyle;
}

export interface DesignReview {
  rounds: number;
  /** What the reviewer still flagged after the last round; empty when it passed. */
  issues: string[];
  /** Everything flagged across rounds, for the user to see what was fixed. */
  fixed: string[];
  passed: boolean;
}

export interface DesignRecord<T = DocSpec | DeckSpec | WorkbookSpec> {
  draftVersion: number;
  spec: T;
  /** Blocks dropped because their numbers were not in the report. */
  dropped: number;
  review?: DesignReview;
  createdAt: string;
}

export interface TaskDesigns {
  doc?: DesignRecord<DocSpec>;
  deck?: DesignRecord<DeckSpec>;
  sheet?: DesignRecord<WorkbookSpec>;
}

export type ExportFormat = 'csv' | 'xlsx' | 'docx' | 'pptx' | 'pdf';

export const EXPORT_FORMATS: Record<ExportFormat, { label: string; design: DesignKind | null }> = {
  csv: { label: 'CSV (표 데이터)', design: null },
  xlsx: { label: 'Excel (.xlsx)', design: 'sheet' },
  docx: { label: 'Word (.docx)', design: 'doc' },
  pdf: { label: 'PDF (인쇄 창에서 저장)', design: 'doc' },
  pptx: { label: 'PowerPoint (.pptx)', design: 'deck' },
};

export const isExportFormat = (v: unknown): v is ExportFormat => typeof v === 'string' && v in EXPORT_FORMATS;
