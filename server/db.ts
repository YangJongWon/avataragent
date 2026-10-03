import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { OfficeEvent } from '../shared/types.ts';
import { config } from './config.ts';

mkdirSync(config.dataDir, { recursive: true });

const db = new DatabaseSync(join(config.dataDir, 'office.db'));

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    seq INTEGER PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    task_id TEXT,
    json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS state_meta (
    key TEXT PRIMARY KEY,
    json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS offices (
    id TEXT PRIMARY KEY,
    team TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    office_id TEXT NOT NULL,
    role TEXT NOT NULL,
    json TEXT NOT NULL,
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    office_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    json TEXT NOT NULL,
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS tasks_office_status_idx ON tasks(office_id, status);
  CREATE INDEX IF NOT EXISTS tasks_created_at_idx ON tasks(created_at);
  CREATE TABLE IF NOT EXISTS mailbox (
    id TEXT PRIMARY KEY,
    received_at TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY,
    event_date TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS inquiries (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    received_at TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY,
    approved_at TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS recommendations (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS share_links (
    id TEXT PRIMARY KEY,
    expires_at TEXT,
    json TEXT NOT NULL
  );
`);

db.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(1, new Date().toISOString());

const insertEvent = db.prepare('INSERT INTO events (seq, event_id, type, task_id, json) VALUES (?, ?, ?, ?, ?)');
const upsertKv = db.prepare('INSERT INTO kv (key, json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json');
const selectKv = db.prepare('SELECT json FROM kv WHERE key = ?');
const selectRecent = db.prepare('SELECT json FROM events ORDER BY seq DESC LIMIT ?');
const selectMaxSeq = db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM events');
const selectMeta = db.prepare('SELECT key, json FROM state_meta');
const selectRows = (table: string) => db.prepare(`SELECT json FROM ${table}`);
const clearTable = (table: string) => db.prepare(`DELETE FROM ${table}`);

type JsonRecord = Record<string, unknown>;

export interface RelationalStateShape extends JsonRecord {
  version: number;
  offices: JsonRecord[];
  agents: JsonRecord[];
  tasks: JsonRecord[];
  mailbox: JsonRecord[];
  calendar: JsonRecord[];
  inquiries: JsonRecord[];
  outbox: JsonRecord[];
  recommendations: JsonRecord[];
  shares: JsonRecord[];
}

const COLLECTIONS = {
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

// Children must be removed before offices while foreign keys are enabled.
const CLEAR_ORDER = [
  'agents',
  'tasks',
  'mailbox',
  'calendar_events',
  'inquiries',
  'outbox',
  'recommendations',
  'share_links',
  'offices',
] as const;

const insertOffice = db.prepare('INSERT INTO offices (id, team, json) VALUES (?, ?, ?)');
const insertAgent = db.prepare('INSERT INTO agents (id, office_id, role, json) VALUES (?, ?, ?, ?)');
const insertTask = db.prepare('INSERT INTO tasks (id, office_id, status, created_at, json) VALUES (?, ?, ?, ?, ?)');
const insertMailbox = db.prepare('INSERT INTO mailbox (id, received_at, json) VALUES (?, ?, ?)');
const insertCalendar = db.prepare('INSERT INTO calendar_events (id, event_date, json) VALUES (?, ?, ?)');
const insertInquiry = db.prepare('INSERT INTO inquiries (id, status, received_at, json) VALUES (?, ?, ?, ?)');
const insertOutbox = db.prepare('INSERT INTO outbox (id, approved_at, json) VALUES (?, ?, ?)');
const insertRecommendation = db.prepare('INSERT INTO recommendations (id, created_at, json) VALUES (?, ?, ?)');
const insertShare = db.prepare('INSERT INTO share_links (id, expires_at, json) VALUES (?, ?, ?)');
const insertMeta = db.prepare('INSERT INTO state_meta (key, json) VALUES (?, ?)');

const value = (row: JsonRecord, key: string, fallback = '') => String(row[key] ?? fallback);
const encoded = (row: JsonRecord) => JSON.stringify(row);

export function saveRelationalState(state: RelationalStateShape) {
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const table of CLEAR_ORDER) clearTable(table).run();
    clearTable('state_meta').run();

    for (const row of state.offices) insertOffice.run(value(row, 'id'), value(row, 'team'), encoded(row));
    for (const row of state.agents) insertAgent.run(value(row, 'id'), value(row, 'officeId'), value(row, 'role'), encoded(row));
    for (const row of state.tasks) {
      insertTask.run(value(row, 'id'), value(row, 'officeId'), value(row, 'status'), value(row, 'createdAt'), encoded(row));
    }
    for (const row of state.mailbox) insertMailbox.run(value(row, 'id'), value(row, 'receivedAt'), encoded(row));
    for (const row of state.calendar) insertCalendar.run(value(row, 'id'), value(row, 'date'), encoded(row));
    for (const row of state.inquiries) {
      insertInquiry.run(value(row, 'id'), value(row, 'status'), value(row, 'receivedAt'), encoded(row));
    }
    for (const row of state.outbox) insertOutbox.run(value(row, 'id'), value(row, 'approvedAt'), encoded(row));
    for (const row of state.recommendations) insertRecommendation.run(value(row, 'id'), value(row, 'createdAt'), encoded(row));
    for (const row of state.shares) insertShare.run(value(row, 'id'), row.expiresAt === null ? null : value(row, 'expiresAt'), encoded(row));

    for (const [key, item] of Object.entries(state)) {
      if (!(key in COLLECTIONS)) insertMeta.run(key, JSON.stringify(item));
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function loadRelationalState<T>(): T | null {
  const metaRows = selectMeta.all() as { key: string; json: string }[];
  if (metaRows.length === 0) return null;
  const state: Record<string, unknown> = Object.fromEntries(metaRows.map((row) => [row.key, JSON.parse(row.json)]));
  for (const [key, table] of Object.entries(COLLECTIONS)) {
    const rows = selectRows(table).all() as { json: string }[];
    state[key] = rows.map((row) => JSON.parse(row.json));
  }
  return state as T;
}

export function appendEvent(event: OfficeEvent) {
  insertEvent.run(event.seq, event.eventId, event.type, event.taskId ?? null, JSON.stringify(event));
}

export function saveKv(key: string, value: unknown) {
  upsertKv.run(key, JSON.stringify(value));
}

export function loadKv<T>(key: string): T | null {
  const row = selectKv.get(key) as { json: string } | undefined;
  return row ? (JSON.parse(row.json) as T) : null;
}

export function recentEvents(limit: number): OfficeEvent[] {
  const rows = selectRecent.all(limit) as { json: string }[];
  return rows.map((r) => JSON.parse(r.json) as OfficeEvent).reverse();
}

export function maxSeq(): number {
  return (selectMaxSeq.get() as { seq: number }).seq;
}
