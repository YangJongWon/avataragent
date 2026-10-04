import { planHas } from '../shared/plans.ts';
import type { OfficeEvent } from '../shared/types.ts';
import { eventOfficeId } from './access.ts';
import { personName } from './chat.ts';
import { eventsBetween } from './db.ts';
import { store } from './store.ts';

export const MAX_EXPORT_EVENTS = 50_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Inclusive day range in local dates as typed; `to` covers the whole last day. */
export function exportRange(from: unknown, to: unknown) {
  const today = new Date().toISOString().slice(0, 10);
  const start = typeof from === 'string' && DAY.test(from) ? from : today;
  const end = typeof to === 'string' && DAY.test(to) ? to : today;
  if (start > end) throw new Error('시작 날짜가 끝 날짜보다 늦어요.');
  const next = new Date(`${end}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start, end, fromIso: `${start}T00:00:00.000Z`, toIso: next.toISOString() };
}

const csvCell = (value: unknown) => {
  const text = value === undefined || value === null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function row(event: OfficeEvent) {
  const officeId = eventOfficeId(event);
  const task = event.taskId ? store.data.tasks.find((t) => t.id === event.taskId) : undefined;
  return {
    time: event.timestamp,
    type: event.type,
    office: store.data.offices.find((o) => o.id === officeId)?.name ?? '',
    task: task?.title ?? event.taskId ?? '',
    assignee: personName(task?.assigneeId) ?? '',
    agent: store.data.agents.find((a) => a.id === event.agentId)?.name ?? '',
    payload: event.payload,
  };
}

export async function exportActivity(from: unknown, to: unknown, format: unknown) {
  if (!planHas(store.data.plan, 'activityExport')) throw new Error('활동 기록 내보내기는 비즈니스 플랜에서 쓸 수 있어요.');
  const range = exportRange(from, to);
  const rows = (await eventsBetween(range.fromIso, range.toIso, MAX_EXPORT_EVENTS)).map(row);
  const name = `activity-${range.start}_${range.end}`;
  if (format === 'json') return { filename: `${name}.json`, type: 'application/json', body: JSON.stringify(rows, null, 2) };
  const header = ['시각', '종류', '사무실', '업무', '담당자', '직원', '내용'];
  const lines = rows.map((r) => [r.time, r.type, r.office, r.task, r.assignee, r.agent, r.payload].map(csvCell).join(','));
  return { filename: `${name}.csv`, type: 'text/csv; charset=utf-8', body: `\uFEFF${[header.join(','), ...lines].join('\r\n')}` };
}
