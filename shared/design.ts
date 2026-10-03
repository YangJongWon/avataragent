/**
 * Layout the AI picks for a finished report. The server renders it; the AI never writes markup or code,
 * so every export stays inside these blocks and the team theme.
 */

export type DesignKind = 'doc' | 'deck';

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
}

export interface DesignRecord<T = DocSpec | DeckSpec> {
  draftVersion: number;
  spec: T;
  /** Blocks dropped because their numbers were not in the report. */
  dropped: number;
  createdAt: string;
}

export interface TaskDesigns {
  doc?: DesignRecord<DocSpec>;
  deck?: DesignRecord<DeckSpec>;
}

export type ExportFormat = 'csv' | 'xlsx' | 'docx' | 'pptx' | 'pdf';

export const EXPORT_FORMATS: Record<ExportFormat, { label: string; design: DesignKind | null }> = {
  csv: { label: 'CSV (표 데이터)', design: null },
  xlsx: { label: 'Excel (.xlsx)', design: null },
  docx: { label: 'Word (.docx)', design: 'doc' },
  pdf: { label: 'PDF (인쇄 창에서 저장)', design: 'doc' },
  pptx: { label: 'PowerPoint (.pptx)', design: 'deck' },
};

export const isExportFormat = (v: unknown): v is ExportFormat => typeof v === 'string' && v in EXPORT_FORMATS;
