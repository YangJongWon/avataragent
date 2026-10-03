import { EXPORT_FORMATS, type DeckSpec, type DesignKind, type DocSpec, type ExportFormat, type TaskDesigns, type WorkbookSpec } from '../../shared/design.ts';
import { splitDraft } from '../../shared/draft.ts';
import type { Artifact, Office, Task } from '../../shared/types.ts';
import { renderDocx } from './docx.ts';
import { renderHtml } from './html.ts';
import { renderPptx } from './pptx.ts';
import { deckFromDoc, docFromMarkdown } from './spec.ts';
import { renderCsv, renderXlsx } from './tables.ts';
import { themeOf } from './theme.ts';

export interface ExportFile {
  body: Buffer | string;
  mime: string;
  filename: string;
  /** True when an AI layout for the current draft was used. */
  designed: boolean;
}

const MIME: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'text/html; charset=utf-8',
};

export const latestDraft = (task: Task): Artifact | undefined => task.artifacts.filter((a) => a.kind === 'draft').at(-1);

export function reportOf(task: Task) {
  const draft = latestDraft(task);
  if (!draft) throw new Error('아직 보고서 초안이 없어서 내보낼 수 없어요.');
  return { draft, markdown: splitDraft(draft.content).body };
}

export function subtitleOf(task: Task, office: Office) {
  const date = new Date(task.completedAt ?? task.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  return `${office.name} · ${date}`;
}

export function designFor<K extends DesignKind>(task: Task, kind: K, draftVersion: number): TaskDesigns[K] | undefined {
  const record = task.designs?.[kind];
  return record && record.draftVersion === draftVersion ? record : undefined;
}

/** The report exactly as written: the source for CSV/Excel values and the fallback layout. */
export function plainDoc(task: Task, office: Office) {
  return docFromMarkdown(reportOf(task).markdown, task.title, subtitleOf(task, office));
}

export function renderDoc(spec: DocSpec, office: Office) {
  return renderDocx(spec, themeOf(office.team, spec.style));
}

export function renderDeck(spec: DeckSpec, office: Office) {
  return renderPptx(spec, themeOf(office.team, spec.style));
}

const fileName = (title: string, ext: string) => `${title.replace(/[\\/:*?"<>|\r\n]+/g, '_').trim().slice(0, 80) || 'report'}.${ext}`;

export async function buildExport(task: Task, office: Office, format: ExportFormat, opts: { print?: boolean } = {}): Promise<ExportFile> {
  const { draft } = reportOf(task);
  const plain = plainDoc(task, office);
  const kind = EXPORT_FORMATS[format].design;
  const doc = kind === 'doc' ? designFor(task, 'doc', draft.version) : undefined;
  const deck = kind === 'deck' ? designFor(task, 'deck', draft.version) : undefined;
  const sheet = kind === 'sheet' ? designFor(task, 'sheet', draft.version) : undefined;
  const docSpec: DocSpec = doc?.spec ?? plain;
  const deckSpec: DeckSpec = deck?.spec ?? deckFromDoc(plain);
  const workbook: WorkbookSpec | undefined = sheet?.spec;
  const file = (body: Buffer | string, ext: string) => ({ body, mime: MIME[format], filename: fileName(task.title, ext), designed: Boolean(doc ?? deck ?? sheet) });
  switch (format) {
    case 'csv':
      return file(renderCsv(plain), 'csv');
    case 'xlsx':
      return file(await renderXlsx(plain, themeOf(office.team, workbook?.style), workbook), 'xlsx');
    case 'docx':
      return file(await renderDoc(docSpec, office), 'docx');
    case 'pptx':
      return file(await renderDeck(deckSpec, office), 'pptx');
    case 'pdf':
      return file(renderHtml(docSpec, themeOf(office.team, docSpec.style), Boolean(opts.print)), 'html');
  }
}
