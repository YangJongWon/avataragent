import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { OfficeEvent } from '../shared/types.ts';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL에 대상 PostgreSQL 연결 문자열을 설정하세요.');

const sqlitePath = resolve(process.env.SQLITE_PATH || 'data/office.db');
if (!existsSync(sqlitePath)) throw new Error(`SQLite 파일을 찾을 수 없습니다: ${sqlitePath}`);

const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
const collections = {
  offices: 'offices',
  agents: 'agents',
  tasks: 'tasks',
  mailbox: 'mailbox',
  calendar: 'calendar_events',
  inquiries: 'inquiries',
  outbox: 'outbox',
  recommendations: 'recommendations',
  shares: 'share_links',
} as const;

const meta = sqlite.prepare('SELECT key, json FROM state_meta').all() as { key: string; json: string }[];
if (meta.length === 0) throw new Error('state_meta가 비어 있습니다. 먼저 현재 앱을 정상 종료해 저장을 완료하세요.');
const state: Record<string, unknown> = Object.fromEntries(meta.map((row) => [row.key, JSON.parse(row.json)]));
for (const [key, table] of Object.entries(collections)) {
  const rows = sqlite.prepare(`SELECT json FROM ${table}`).all() as { json: string }[];
  state[key] = rows.map((row) => JSON.parse(row.json));
}
const events = (sqlite.prepare('SELECT json FROM events ORDER BY seq').all() as { json: string }[]).map(
  (row) => JSON.parse(row.json) as OfficeEvent,
);
sqlite.close();

const { appendEvent, closeStorage, flushStorage, saveRelationalState, storageInfo } = await import('../server/db.ts');
if (storageInfo().backend !== 'postgresql') throw new Error('PostgreSQL 저장소가 선택되지 않았습니다. DATABASE_URL을 확인하세요.');
saveRelationalState(state as Parameters<typeof saveRelationalState>[0]);
for (const event of events) appendEvent(event);
await flushStorage();
await closeStorage();
console.log(`이관 완료: 사무실 ${(state.offices as unknown[]).length}개, 직원 ${(state.agents as unknown[]).length}명, 업무 ${(state.tasks as unknown[]).length}개, 이벤트 ${events.length}개`);
