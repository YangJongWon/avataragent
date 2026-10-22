import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeBlocks } from '../shared/code-blocks.ts';
import { splitDraft } from '../shared/draft.ts';
import type { TaskFile } from '../shared/types.ts';
import { config } from './config.ts';
import { store } from './store.ts';

/**
 * Files a task produced, on disk under DATA_DIR/files/<taskId>/, listed on the task. The result's code blocks are
 * written again whenever the result changes; files from MCP tools stay until the task is removed.
 */

export const FILE_LIMITS = { fileBytes: 25 * 1024 * 1024, taskBytes: 200 * 1024 * 1024, perTask: 60 };

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  pdf: 'application/pdf',
  json: 'application/json',
  md: 'text/markdown',
  csv: 'text/csv',
  html: 'text/html',
  zip: 'application/zip',
};
const EXT_OF: Record<string, string> = Object.fromEntries(Object.entries(MIME).map(([ext, mime]) => [mime, ext]));

export const mimeOf = (name: string) => MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'text/plain';
export const extOf = (mime: string) => EXT_OF[mime] ?? (mime.startsWith('text/') ? 'txt' : 'bin');

/** Types the browser may show in the page; anything else (HTML, SVG, scripts) is only ever downloaded. */
export const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'application/pdf']);

const dirOf = (taskId: string) => join(config.dataDir, 'files', taskId.replace(/[^\w-]/g, ''));
const safeName = (name: string) => name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '').slice(0, 120) || 'file';
const pathOf = (taskId: string, file: TaskFile) => join(dirOf(taskId), `${file.id}-${safeName(file.name)}`);

/** Saves a file for a task; null when it would pass the limits (the task keeps going without it). */
export function saveTaskFile(taskId: string, input: { name: string; mime?: string; data: Buffer; source: TaskFile['source']; origin?: string; agentId?: string }) {
  const task = store.task(taskId);
  const files = task.files ?? [];
  const used = files.reduce((sum, f) => sum + f.size, 0);
  if (input.data.length > FILE_LIMITS.fileBytes || used + input.data.length > FILE_LIMITS.taskBytes || files.length >= FILE_LIMITS.perTask) return null;
  const file: TaskFile = {
    id: `file_${randomUUID().slice(0, 8)}`,
    name: safeName(input.name),
    mime: input.mime || mimeOf(input.name),
    size: input.data.length,
    source: input.source,
    ...(input.origin ? { origin: input.origin } : {}),
    ...(input.agentId ? { agentId: input.agentId } : {}),
    createdAt: new Date().toISOString(),
  };
  mkdirSync(dirOf(taskId), { recursive: true });
  writeFileSync(pathOf(taskId, file), input.data);
  store.updateTask(taskId, (t) => {
    t.files = [...(t.files ?? []), file];
  });
  return file;
}

export function readTaskFile(taskId: string, fileId: string) {
  const file = store.task(taskId).files?.find((f) => f.id === fileId);
  if (!file) return null;
  const path = pathOf(taskId, file);
  if (!existsSync(path) || !statSync(path).isFile()) return null;
  return { file, data: readFileSync(path) };
}

export function removeTaskFile(taskId: string, fileId: string) {
  const file = store.task(taskId).files?.find((f) => f.id === fileId);
  if (!file) return false;
  rmSync(pathOf(taskId, file), { force: true });
  store.updateTask(taskId, (t) => {
    t.files = (t.files ?? []).filter((f) => f.id !== fileId);
  });
  return true;
}

export function removeTaskFiles(taskId: string) {
  rmSync(dirOf(taskId), { recursive: true, force: true });
}

/** Writes the result's code blocks as files, replacing those of an earlier result. */
export function syncDraftFiles(taskId: string, markdown: string, agentId?: string) {
  for (const old of (store.task(taskId).files ?? []).filter((f) => f.source === 'draft')) removeTaskFile(taskId, old.id);
  const blocks = codeBlocks(splitDraft(markdown).body);
  const title = store.task(taskId).title;
  blocks.forEach((block, i) => {
    const name = block.name ?? `${title}${blocks.length > 1 ? `-${i + 1}` : ''}.${block.ext}`;
    saveTaskFile(taskId, { name, mime: 'text/plain', data: Buffer.from(block.code, 'utf8'), source: 'draft', agentId });
  });
}
