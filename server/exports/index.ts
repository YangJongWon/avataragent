import { EXPORT_FORMATS, type DeckSpec, type DesignKind, type DocSpec, type ExportFormat } from '../../shared/design.ts';
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

export function designFor<K extends DesignKind>(task: Task, kind: K, draftVersion: number) {
  const record = task.designs?.[kind];
  return record && record.draftVersion === draftVersion ? record : undefined;
}

const fileName = (title: string, ext: string) => `${title.replace(/[\\/:*?"<>|\r\n]+/g, '_').trim().slice(0, 80) || 'report'}.${ext}`;

export async function buildExport(task: Task, office: Office, format: ExportFormat, opts: { print?: boolean } = {}): Promise<ExportFile> {
  const { draft, markdown } = reportOf(task);
  const theme = themeOf(office.team);
  const plain = docFromMarkdown(markdown, task.title, subtitleOf(task, office));
  const kind = EXPORT_FORMATS[format].design;
  const docDesign = kind === 'doc' ? designFor(task, 'doc', draft.version) : undefined;
  const deckDesign = kind === 'deck' ? designFor(task, 'deck', draft.version) : undefined;
  const doc: DocSpec = docDesign?.spec ?? plain;
  const deck: DeckSpec = deckDesign?.spec ?? deckFromDoc(plain);
  const file = (body: Buffer | string, ext: string) => ({
    body,
    mime: MIME[format],
    filename: fileName(task.title, ext),
    designed: Boolean(docDesign ?? deckDesign),
  });
  switch (format) {
    case 'csv':
      return file(renderCsv(plain), 'csv');
    case 'xlsx':
      return file(await renderXlsx(plain, theme), 'xlsx');
    case 'docx':
      return file(await renderDocx(doc, theme), 'docx');
    case 'pptx':
      return file(await renderPptx(deck, theme), 'pptx');
    case 'pdf':
      return file(renderHtml(doc, theme, Boolean(opts.print)), 'html');
  }
}
