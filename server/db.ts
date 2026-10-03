import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Pool, type PoolClient } from 'pg';
import type { OfficeEvent } from '../shared/types.ts';
import { config } from './config.ts';

mkdirSync(config.dataDir, { recursive: true });

const usingPostgres = Boolean(config.databaseUrl);
const db = usingPostgres ? null : new DatabaseSync(join(config.dataDir, 'office.db'));
const pool = usingPostgres ? new Pool({ connectionString: config.databaseUrl, max: 10 }) : null;

db?.exec(`
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
  CREATE TABLE IF NOT EXISTS workflow_steps (
    task_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    json TEXT NOT NULL,
    PRIMARY KEY (task_id, step_id),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at TEXT NOT NULL,
    json TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS ai_calls (
    event_id TEXT PRIMARY KEY,
    task_id TEXT,
    agent_id TEXT,
    purpose TEXT,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_krw REAL NOT NULL,
    occurred_at TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS cost_entries (
    event_id TEXT PRIMARY KEY,
    task_id TEXT,
    agent_id TEXT,
    amount_krw REAL NOT NULL,
    occurred_at TEXT NOT NULL,
    json TEXT NOT NULL
  );
`);

db?.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(1, new Date().toISOString());

const sqlite = db!;
const insertEvent = db?.prepare('INSERT INTO events (seq, event_id, type, task_id, json) VALUES (?, ?, ?, ?, ?)');
const upsertKv = db?.prepare('INSERT INTO kv (key, json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json');
const selectKv = db?.prepare('SELECT json FROM kv WHERE key = ?');
const selectRecent = db?.prepare('SELECT json FROM events ORDER BY seq DESC LIMIT ?');
const selectMaxSeq = db?.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM events');
const selectMeta = db?.prepare('SELECT key, json FROM state_meta');
const selectRows = (table: string) => sqlite.prepare(`SELECT json FROM ${table}`);
const clearTable = (table: string) => sqlite.prepare(`DELETE FROM ${table}`);

type JsonRecord = Record<string, unknown>;

let writeQueue: Promise<void> = Promise.resolve();
let lastWriteError: Error | null = null;
let pgState: Record<string, unknown> | null = null;
let pgEvents: OfficeEvent[] = [];
const pgKv = new Map<string, unknown>();

const POSTGRES_SCHEMA = `
  CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL);
  CREATE TABLE IF NOT EXISTS events (seq BIGINT PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, type TEXT NOT NULL, task_id TEXT, json JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, json JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS state_meta (key TEXT PRIMARY KEY, json JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS offices (id TEXT PRIMARY KEY, team TEXT NOT NULL, json JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, office_id TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE, role TEXT NOT NULL, json JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, office_id TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE, status TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, json JSONB NOT NULL);
  CREATE INDEX IF NOT EXISTS tasks_office_status_idx ON tasks(office_id, status);
  CREATE INDEX IF NOT EXISTS tasks_created_at_idx ON tasks(created_at);
  CREATE TABLE IF NOT EXISTS mailbox (id TEXT PRIMARY KEY, received_at TIMESTAMPTZ NOT NULL, json JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS calendar_events (id TEXT PRIMARY KEY, event_date DATE NOT NULL, json JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS inquiries (id TEXT PRIMARY KEY, status TEXT NOT NULL, received_at TIMESTAMPTZ NOT NULL, json JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, approved_at TIMESTAMPTZ NOT NULL, json JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS recommendations (id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL, json JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS share_links (id TEXT PRIMARY KEY, expires_at TIMESTAMPTZ, json JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS workflow_steps (task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, step_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, json JSONB NOT NULL, PRIMARY KEY(task_id, step_id));
  CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, step_id TEXT NOT NULL, kind TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, json JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS ai_calls (event_id TEXT PRIMARY KEY, task_id TEXT, agent_id TEXT, purpose TEXT, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, cost_krw DOUBLE PRECISION NOT NULL, occurred_at TIMESTAMPTZ NOT NULL, json JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS cost_entries (event_id TEXT PRIMARY KEY, task_id TEXT, agent_id TEXT, amount_krw DOUBLE PRECISION NOT NULL, occurred_at TIMESTAMPTZ NOT NULL, json JSONB NOT NULL);
`;

async function initializePostgres() {
  if (!pool) return;
  await pool.query(POSTGRES_SCHEMA);
  await pool.query('INSERT INTO schema_migrations(version, applied_at) VALUES($1, NOW()) ON CONFLICT(version) DO NOTHING', [1]);
  const meta = await pool.query<{ key: string; json: unknown }>('SELECT key, json FROM state_meta');
  if (meta.rowCount) {
    pgState = Object.fromEntries(meta.rows.map((row) => [row.key, row.json]));
    for (const [key, table] of Object.entries(COLLECTIONS)) {
      const rows = await pool.query<{ json: unknown }>(`SELECT json FROM ${table}`);
      pgState[key] = rows.rows.map((row) => row.json);
    }
  }
  const events = await pool.query<{ json: OfficeEvent }>('SELECT json FROM events ORDER BY seq DESC LIMIT 300');
  pgEvents = events.rows.reverse().map((row) => row.json);
  const kv = await pool.query<{ key: string; json: unknown }>('SELECT key, json FROM kv');
  for (const row of kv.rows) pgKv.set(row.key, row.json);
}

function enqueue(write: () => Promise<void>) {
  writeQueue = writeQueue.then(write).catch((error: unknown) => {
    lastWriteError = error instanceof Error ? error : new Error(String(error));
    console.error('[storage] PostgreSQL write failed:', lastWriteError);
  });
}

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
  'artifacts',
  'workflow_steps',
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

const insertOffice = db?.prepare('INSERT INTO offices (id, team, json) VALUES (?, ?, ?)');
const insertAgent = db?.prepare('INSERT INTO agents (id, office_id, role, json) VALUES (?, ?, ?, ?)');
const insertTask = db?.prepare('INSERT INTO tasks (id, office_id, status, created_at, json) VALUES (?, ?, ?, ?, ?)');
const insertMailbox = db?.prepare('INSERT INTO mailbox (id, received_at, json) VALUES (?, ?, ?)');
const insertCalendar = db?.prepare('INSERT INTO calendar_events (id, event_date, json) VALUES (?, ?, ?)');
const insertInquiry = db?.prepare('INSERT INTO inquiries (id, status, received_at, json) VALUES (?, ?, ?, ?)');
const insertOutbox = db?.prepare('INSERT INTO outbox (id, approved_at, json) VALUES (?, ?, ?)');
const insertRecommendation = db?.prepare('INSERT INTO recommendations (id, created_at, json) VALUES (?, ?, ?)');
const insertShare = db?.prepare('INSERT INTO share_links (id, expires_at, json) VALUES (?, ?, ?)');
const insertMeta = db?.prepare('INSERT INTO state_meta (key, json) VALUES (?, ?)');
const insertStep = db?.prepare('INSERT INTO workflow_steps (task_id, step_id, kind, status, json) VALUES (?, ?, ?, ?, ?)');
const insertArtifact = db?.prepare('INSERT INTO artifacts (id, task_id, step_id, kind, created_at, json) VALUES (?, ?, ?, ?, ?, ?)');
const insertAiCall = db?.prepare('INSERT OR IGNORE INTO ai_calls (event_id, task_id, agent_id, purpose, input_tokens, output_tokens, cost_krw, occurred_at, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
const insertCost = db?.prepare('INSERT OR IGNORE INTO cost_entries (event_id, task_id, agent_id, amount_krw, occurred_at, json) VALUES (?, ?, ?, ?, ?, ?)');

const value = (row: JsonRecord, key: string, fallback = '') => String(row[key] ?? fallback);
const encoded = (row: JsonRecord) => JSON.stringify(row);

await initializePostgres();

async function replacePostgresState(state: RelationalStateShape) {
  const client = await pool!.connect();
  try {
    await client.query('BEGIN');
    for (const table of CLEAR_ORDER) await client.query(`DELETE FROM ${table}`);
    await client.query('DELETE FROM state_meta');
    const put = (sql: string, values: unknown[]) => client.query(sql, values);
    for (const row of state.offices) await put('INSERT INTO offices(id, team, json) VALUES($1,$2,$3)', [value(row, 'id'), value(row, 'team'), row]);
    for (const row of state.agents) await put('INSERT INTO agents(id, office_id, role, json) VALUES($1,$2,$3,$4)', [value(row, 'id'), value(row, 'officeId'), value(row, 'role'), row]);
    for (const row of state.tasks) {
      await put('INSERT INTO tasks(id, office_id, status, created_at, json) VALUES($1,$2,$3,$4,$5)', [value(row, 'id'), value(row, 'officeId'), value(row, 'status'), value(row, 'createdAt'), row]);
      for (const step of (row.plan as JsonRecord[] | undefined) ?? []) await put('INSERT INTO workflow_steps(task_id, step_id, kind, status, json) VALUES($1,$2,$3,$4,$5)', [value(row, 'id'), value(step, 'id'), value(step, 'kind'), value(step, 'status'), step]);
      for (const artifact of (row.artifacts as JsonRecord[] | undefined) ?? []) await put('INSERT INTO artifacts(id, task_id, step_id, kind, created_at, json) VALUES($1,$2,$3,$4,$5,$6)', [value(artifact, 'id'), value(row, 'id'), value(artifact, 'stepId'), value(artifact, 'kind'), value(artifact, 'createdAt'), artifact]);
    }
    for (const row of state.mailbox) await put('INSERT INTO mailbox(id, received_at, json) VALUES($1,$2,$3)', [value(row, 'id'), value(row, 'receivedAt'), row]);
    for (const row of state.calendar) await put('INSERT INTO calendar_events(id, event_date, json) VALUES($1,$2,$3)', [value(row, 'id'), value(row, 'date'), row]);
    for (const row of state.inquiries) await put('INSERT INTO inquiries(id, status, received_at, json) VALUES($1,$2,$3,$4)', [value(row, 'id'), value(row, 'status'), value(row, 'receivedAt'), row]);
    for (const row of state.outbox) await put('INSERT INTO outbox(id, approved_at, json) VALUES($1,$2,$3)', [value(row, 'id'), value(row, 'approvedAt'), row]);
    for (const row of state.recommendations) await put('INSERT INTO recommendations(id, created_at, json) VALUES($1,$2,$3)', [value(row, 'id'), value(row, 'createdAt'), row]);
    for (const row of state.shares) await put('INSERT INTO share_links(id, expires_at, json) VALUES($1,$2,$3)', [value(row, 'id'), row.expiresAt ?? null, row]);
    for (const [key, item] of Object.entries(state)) if (!(key in COLLECTIONS)) await put('INSERT INTO state_meta(key, json) VALUES($1,$2)', [key, JSON.stringify(item)]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function saveRelationalState(state: RelationalStateShape) {
  if (pool) {
    pgState = structuredClone(state);
    enqueue(() => replacePostgresState(structuredClone(state)));
    return;
  }
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    for (const table of CLEAR_ORDER) clearTable(table).run();
    clearTable('state_meta').run();

    for (const row of state.offices) insertOffice!.run(value(row, 'id'), value(row, 'team'), encoded(row));
    for (const row of state.agents) insertAgent!.run(value(row, 'id'), value(row, 'officeId'), value(row, 'role'), encoded(row));
    for (const row of state.tasks) {
      insertTask!.run(value(row, 'id'), value(row, 'officeId'), value(row, 'status'), value(row, 'createdAt'), encoded(row));
      for (const step of (row.plan as JsonRecord[] | undefined) ?? []) insertStep!.run(value(row, 'id'), value(step, 'id'), value(step, 'kind'), value(step, 'status'), encoded(step));
      for (const artifact of (row.artifacts as JsonRecord[] | undefined) ?? []) insertArtifact!.run(value(artifact, 'id'), value(row, 'id'), value(artifact, 'stepId'), value(artifact, 'kind'), value(artifact, 'createdAt'), encoded(artifact));
    }
    for (const row of state.mailbox) insertMailbox!.run(value(row, 'id'), value(row, 'receivedAt'), encoded(row));
    for (const row of state.calendar) insertCalendar!.run(value(row, 'id'), value(row, 'date'), encoded(row));
    for (const row of state.inquiries) {
      insertInquiry!.run(value(row, 'id'), value(row, 'status'), value(row, 'receivedAt'), encoded(row));
    }
    for (const row of state.outbox) insertOutbox!.run(value(row, 'id'), value(row, 'approvedAt'), encoded(row));
    for (const row of state.recommendations) insertRecommendation!.run(value(row, 'id'), value(row, 'createdAt'), encoded(row));
    for (const row of state.shares) insertShare!.run(value(row, 'id'), row.expiresAt === null ? null : value(row, 'expiresAt'), encoded(row));

    for (const [key, item] of Object.entries(state)) {
      if (!(key in COLLECTIONS)) insertMeta!.run(key, JSON.stringify(item));
    }
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}

export function loadRelationalState<T>(): T | null {
  if (pool) return pgState as T | null;
  const metaRows = selectMeta!.all() as { key: string; json: string }[];
  if (metaRows.length === 0) return null;
  const state: Record<string, unknown> = Object.fromEntries(metaRows.map((row) => [row.key, JSON.parse(row.json)]));
  for (const [key, table] of Object.entries(COLLECTIONS)) {
    const rows = selectRows(table).all() as { json: string }[];
    state[key] = rows.map((row) => JSON.parse(row.json));
  }
  return state as T;
}

export function appendEvent(event: OfficeEvent) {
  if (pool) {
    pgEvents.push(structuredClone(event));
    pgEvents = pgEvents.slice(-300);
    enqueue(async () => {
      await pool.query('INSERT INTO events(seq,event_id,type,task_id,json) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [event.seq, event.eventId, event.type, event.taskId ?? null, event]);
      await insertPostgresLedger(pool, event);
    });
    return;
  }
  insertEvent!.run(event.seq, event.eventId, event.type, event.taskId ?? null, JSON.stringify(event));
  insertSqliteLedger(event);
}

export function saveKv(key: string, value: unknown) {
  if (pool) {
    pgKv.set(key, structuredClone(value));
    enqueue(() => pool.query('INSERT INTO kv(key,json) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET json=EXCLUDED.json', [key, JSON.stringify(value)]).then(() => undefined));
    return;
  }
  upsertKv!.run(key, JSON.stringify(value));
}

export function loadKv<T>(key: string): T | null {
  if (pool) return (pgKv.get(key) as T | undefined) ?? null;
  const row = selectKv!.get(key) as { json: string } | undefined;
  return row ? (JSON.parse(row.json) as T) : null;
}

export function recentEvents(limit: number): OfficeEvent[] {
  if (pool) return pgEvents.slice(-limit);
  const rows = selectRecent!.all(limit) as { json: string }[];
  return rows.map((r) => JSON.parse(r.json) as OfficeEvent).reverse();
}

export function maxSeq(): number {
  if (pool) return pgEvents.at(-1)?.seq ?? 0;
  return (selectMaxSeq!.get() as { seq: number }).seq;
}

function ledger(event: OfficeEvent) {
  const p = event.payload;
  return {
    purpose: typeof p.purpose === 'string' ? p.purpose : null,
    inputTokens: Number(p.inputTokens ?? 0),
    outputTokens: Number(p.outputTokens ?? 0),
    amountKrw: Number(p.amountKrw ?? 0),
  };
}

function insertSqliteLedger(event: OfficeEvent) {
  if (event.type !== 'cost.recorded') return;
  const item = ledger(event);
  const json = JSON.stringify(event);
  insertAiCall!.run(event.eventId, event.taskId ?? null, event.agentId ?? null, item.purpose, item.inputTokens, item.outputTokens, item.amountKrw, event.timestamp, json);
  insertCost!.run(event.eventId, event.taskId ?? null, event.agentId ?? null, item.amountKrw, event.timestamp, json);
}

async function insertPostgresLedger(client: Pick<PoolClient, 'query'> | Pool, event: OfficeEvent) {
  if (event.type !== 'cost.recorded') return;
  const item = ledger(event);
  await client.query('INSERT INTO ai_calls(event_id,task_id,agent_id,purpose,input_tokens,output_tokens,cost_krw,occurred_at,json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(event_id) DO NOTHING', [event.eventId, event.taskId ?? null, event.agentId ?? null, item.purpose, item.inputTokens, item.outputTokens, item.amountKrw, event.timestamp, event]);
  await client.query('INSERT INTO cost_entries(event_id,task_id,agent_id,amount_krw,occurred_at,json) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(event_id) DO NOTHING', [event.eventId, event.taskId ?? null, event.agentId ?? null, item.amountKrw, event.timestamp, event]);
}

export async function flushStorage() {
  await writeQueue;
  if (lastWriteError) throw lastWriteError;
}

export function storageInfo() {
  return { backend: pool ? ('postgresql' as const) : ('sqlite' as const), healthy: lastWriteError === null, error: lastWriteError?.message ?? null };
}

export async function closeStorage() {
  await flushStorage();
  await pool?.end();
  db?.close();
}
