import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { OfficeEvent } from '../shared/types.ts';
import { config } from './config.ts';

mkdirSync(config.dataDir, { recursive: true });

const db = new DatabaseSync(join(config.dataDir, 'office.db'));

db.exec(`
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
`);

const insertEvent = db.prepare('INSERT INTO events (seq, event_id, type, task_id, json) VALUES (?, ?, ?, ?, ?)');
const upsertKv = db.prepare('INSERT INTO kv (key, json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json');
const selectKv = db.prepare('SELECT json FROM kv WHERE key = ?');
const selectRecent = db.prepare('SELECT json FROM events ORDER BY seq DESC LIMIT ?');
const selectMaxSeq = db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM events');

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
