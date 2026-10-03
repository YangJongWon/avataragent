import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { OfficeEvent } from '../shared/types.ts';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL에 대상 PostgreSQL 연결 문자열을 설정하세요.');

const sqlitePath = resolve(process.env.SQLITE_PATH || 'data/office.db');
if (!existsSync(sqlitePath)) throw new Error(`SQLite 파일을 찾을 수 없습니다: ${sqlitePath}`);

const tenant = process.env.TENANT_ID?.trim() || 'default';
const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
const hasTenant = (sqlite.prepare('PRAGMA table_info(offices)').all() as { name: string }[]).some((c) => c.name === 'tenant_id');
// Version 1 files hold a single tenant; version 2 files are read for TENANT_ID only, in the saved order.
const rows = (table: string, extra = '') =>
  (hasTenant
    ? sqlite.prepare(`SELECT * FROM ${table} WHERE tenant_id = ? ${extra}`).all(tenant)
    : sqlite.prepare(`SELECT * FROM ${table}`).all()) as { key?: string; json: string }[];
const ordered = hasTenant ? 'ORDER BY pos' : '';

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

const meta = rows('state_meta');
if (meta.length === 0) throw new Error(`tenant "${tenant}"의 state_meta가 비어 있습니다. 먼저 현재 앱을 정상 종료해 저장을 완료하세요.`);
const state: Record<string, unknown> = Object.fromEntries(meta.map((row) => [row.key, JSON.parse(row.json)]));
for (const [key, table] of Object.entries(collections)) state[key] = rows(table, ordered).map((row) => JSON.parse(row.json));
const events = rows('events', 'ORDER BY seq').map((row) => JSON.parse(row.json) as OfficeEvent);
const kv = rows('kv').map((row) => [row.key!, JSON.parse(row.json)] as const);
sqlite.close();

const { appendEvent, closeStorage, flushStorage, loadRelationalState, saveKv, saveRelationalState, storageInfo } = await import('../server/db.ts');
if (storageInfo().backend !== 'postgresql') throw new Error('PostgreSQL 저장소가 선택되지 않았습니다. DATABASE_URL을 확인하세요.');
if (loadRelationalState()) {
  await closeStorage();
  throw new Error(`PostgreSQL에 이미 tenant "${tenant}"의 데이터가 있습니다. 다른 TENANT_ID로 옮기거나 기존 데이터를 먼저 정리하세요.`);
}
saveRelationalState(state as Parameters<typeof saveRelationalState>[0]);
for (const event of events) appendEvent(event);
for (const [key, value] of kv) saveKv(key, value);
await flushStorage();
await closeStorage();
console.log(
  `이관 완료 (tenant "${tenant}"): 사무실 ${(state.offices as unknown[]).length}개, 직원 ${(state.agents as unknown[]).length}명, 업무 ${(state.tasks as unknown[]).length}개, 이벤트 ${events.length}개, 설정 ${kv.length}개`,
);
