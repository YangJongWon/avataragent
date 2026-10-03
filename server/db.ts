import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { Pool, type PoolClient } from 'pg';
import type { OfficeEvent } from '../shared/types.ts';
import { config } from './config.ts';

mkdirSync(config.dataDir, { recursive: true });

const TENANT = config.tenantId;
const SCHEMA_VERSION = 2;

const usingPostgres = Boolean(config.databaseUrl);
const db = usingPostgres ? null : new DatabaseSync(join(config.dataDir, 'office.db'));
const pool = usingPostgres ? new Pool({ connectionString: config.databaseUrl, max: 10, keepAlive: true }) : null;

type JsonRecord = Record<string, unknown>;
type Kind = 'text' | 'json' | 'time' | 'date' | 'int' | 'bigint' | 'real';

interface Column {
  name: string;
  kind: Kind;
  nullable?: boolean;
}

interface TableSpec {
  name: string;
  key: string[];
  columns: Column[];
  /** Rows written from the state snapshot: diffed per row and guarded by a version number. */
  versioned: boolean;
  /** Keeps the state array order in a `pos` column; position-only moves do not bump the version. */
  ordered?: boolean;
  indexes?: string[][];
  unique?: string[][];
}

const col = (name: string, kind: Kind = 'text', nullable = false): Column => ({ name, kind, nullable });
const json = col('json', 'json');

const TABLES: TableSpec[] = [
  { name: 'events', key: ['seq'], versioned: false, columns: [col('seq', 'bigint'), col('event_id'), col('type'), col('task_id', 'text', true), json], unique: [['event_id']] },
  { name: 'kv', key: ['key'], versioned: false, columns: [col('key'), json] },
  { name: 'ai_calls', key: ['event_id'], versioned: false, columns: [col('event_id'), col('task_id', 'text', true), col('agent_id', 'text', true), col('purpose', 'text', true), col('input_tokens', 'int'), col('output_tokens', 'int'), col('cost_krw', 'real'), col('occurred_at', 'time'), json] },
  { name: 'cost_entries', key: ['event_id'], versioned: false, columns: [col('event_id'), col('task_id', 'text', true), col('agent_id', 'text', true), col('amount_krw', 'real'), col('occurred_at', 'time'), json] },
  { name: 'state_meta', key: ['key'], versioned: true, columns: [col('key'), json] },
  { name: 'offices', key: ['id'], versioned: true, ordered: true, columns: [col('id'), col('team'), json] },
  { name: 'agents', key: ['id'], versioned: true, ordered: true, columns: [col('id'), col('office_id'), col('role'), json], indexes: [['office_id']] },
  { name: 'tasks', key: ['id'], versioned: true, ordered: true, columns: [col('id'), col('office_id'), col('status'), col('created_at', 'time'), json], indexes: [['office_id', 'status'], ['created_at']] },
  { name: 'mailbox', key: ['id'], versioned: true, ordered: true, columns: [col('id'), col('received_at', 'time'), json] },
  { name: 'calendar_events', key: ['id'], versioned: true, ordered: true, columns: [col('id'), col('event_date', 'date'), json] },
  { name: 'inquiries', key: ['id'], versioned: true, ordered: true, columns: [col('id'), col('status'), col('received_at', 'time'), json] },
  { name: 'outbox', key: ['id'], versioned: true, ordered: true, columns: [col('id'), col('approved_at', 'time'), json] },
  { name: 'recommendations', key: ['id'], versioned: true, ordered: true, columns: [col('id'), col('created_at', 'time'), json] },
  { name: 'share_links', key: ['id'], versioned: true, ordered: true, columns: [col('id'), col('expires_at', 'time', true), json] },
  { name: 'workflow_steps', key: ['task_id', 'step_id'], versioned: true, columns: [col('task_id'), col('step_id'), col('kind'), col('status'), json] },
  { name: 'artifacts', key: ['id'], versioned: true, columns: [col('id'), col('task_id'), col('step_id'), col('kind'), col('created_at', 'time'), json], indexes: [['task_id']] },
];

const VERSIONED = TABLES.filter((t) => t.versioned);
const APPEND_ONLY = TABLES.filter((t) => !t.versioned);

/** State keys stored as rows of their own table; every other key goes to state_meta. */
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

// ---------------------------------------------------------------- schema

const SQL_TYPE: Record<Kind, [sqlite: string, postgres: string]> = {
  text: ['TEXT', 'TEXT'],
  json: ['TEXT', 'JSONB'],
  time: ['TEXT', 'TIMESTAMPTZ'],
  date: ['TEXT', 'DATE'],
  int: ['INTEGER', 'INTEGER'],
  bigint: ['INTEGER', 'BIGINT'],
  real: ['REAL', 'DOUBLE PRECISION'],
};

function createTableSql(t: TableSpec, pg: boolean, name = t.name) {
  const columns = [
    'tenant_id TEXT NOT NULL',
    ...(t.versioned ? ['version INTEGER NOT NULL DEFAULT 1'] : []),
    ...(t.ordered ? ['pos INTEGER NOT NULL DEFAULT 0'] : []),
    ...t.columns.map((c) => `${c.name} ${SQL_TYPE[c.kind][pg ? 1 : 0]}${c.nullable ? '' : ' NOT NULL'}`),
  ];
  return `CREATE TABLE IF NOT EXISTS ${name} (${columns.join(', ')}, PRIMARY KEY (tenant_id, ${t.key.join(', ')}))`;
}

function indexSql(t: TableSpec) {
  return [
    ...(t.indexes ?? []).map((cols) => `CREATE INDEX IF NOT EXISTS ${t.name}_${cols.join('_')}_idx ON ${t.name} (tenant_id, ${cols.join(', ')})`),
    ...(t.unique ?? []).map((cols) => `CREATE UNIQUE INDEX IF NOT EXISTS ${t.name}_${cols.join('_')}_key ON ${t.name} (tenant_id, ${cols.join(', ')})`),
  ];
}

const schemaSql = (pg: boolean) => [
  `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at ${pg ? 'TIMESTAMPTZ' : 'TEXT'} NOT NULL)`,
  ...TABLES.flatMap((t) => [createTableSql(t, pg), ...indexSql(t)]),
];

// ---------------------------------------------------------------- row diff

interface Persisted {
  key: unknown[];
  version: number;
  json: string;
  pos: number;
}

interface Write {
  sql: string;
  params: unknown[];
  table: string;
  key: string;
}

export class StorageConflictError extends Error {
  readonly table: string;
  readonly key: string;
  constructor(table: string, key: string) {
    super(`다른 쓰기와 충돌했습니다: ${table}/${key}`);
    this.table = table;
    this.key = key;
  }
}

/** What this process believes each versioned row looks like in the database. */
let persisted = new Map<string, Map<string, Persisted>>();

const text = (row: JsonRecord, key: string) => String(row[key] ?? '');
const keyOf = (t: TableSpec, row: JsonRecord) => t.key.map((k) => String(row[k])).join('\u0000');

function rowsOf(state: RelationalStateShape) {
  const rows = new Map<string, JsonRecord[]>(VERSIONED.map((t) => [t.name, []]));
  const push = (table: string, row: JsonRecord) => rows.get(table)!.push(row);
  for (const o of state.offices) push('offices', { id: text(o, 'id'), team: text(o, 'team'), json: o });
  for (const a of state.agents) push('agents', { id: text(a, 'id'), office_id: text(a, 'officeId'), role: text(a, 'role'), json: a });
  for (const t of state.tasks) {
    push('tasks', { id: text(t, 'id'), office_id: text(t, 'officeId'), status: text(t, 'status'), created_at: text(t, 'createdAt'), json: t });
    for (const s of (t.plan as JsonRecord[] | undefined) ?? []) {
      push('workflow_steps', { task_id: text(t, 'id'), step_id: text(s, 'id'), kind: text(s, 'kind'), status: text(s, 'status'), json: s });
    }
    for (const a of (t.artifacts as JsonRecord[] | undefined) ?? []) {
      push('artifacts', { id: text(a, 'id'), task_id: text(t, 'id'), step_id: text(a, 'stepId'), kind: text(a, 'kind'), created_at: text(a, 'createdAt'), json: a });
    }
  }
  for (const m of state.mailbox) push('mailbox', { id: text(m, 'id'), received_at: text(m, 'receivedAt'), json: m });
  for (const c of state.calendar) push('calendar_events', { id: text(c, 'id'), event_date: text(c, 'date'), json: c });
  for (const i of state.inquiries) push('inquiries', { id: text(i, 'id'), status: text(i, 'status'), received_at: text(i, 'receivedAt'), json: i });
  for (const o of state.outbox) push('outbox', { id: text(o, 'id'), approved_at: text(o, 'approvedAt'), json: o });
  for (const r of state.recommendations) push('recommendations', { id: text(r, 'id'), created_at: text(r, 'createdAt'), json: r });
  for (const s of state.shares) push('share_links', { id: text(s, 'id'), expires_at: s.expiresAt ? String(s.expiresAt) : null, json: s });
  for (const [key, item] of Object.entries(state)) if (!(key in COLLECTIONS)) push('state_meta', { key, json: item });
  return rows;
}

const where = (t: TableSpec) => ['tenant_id = ?', ...t.key.map((k) => `${k} = ?`)].join(' AND ');

/** Inserts, version-checked updates and deletes that turn the stored rows into `state`. */
function planWrites(state: RelationalStateShape) {
  const current = rowsOf(state);
  const writes: Write[] = [];
  const next = new Map<string, Map<string, Persisted>>();
  for (const t of VERSIONED) {
    const before = persisted.get(t.name) ?? new Map<string, Persisted>();
    const after = new Map<string, Persisted>();
    const valueColumns = t.columns.filter((c) => !t.key.includes(c.name));
    current.get(t.name)!.forEach((row, pos) => {
      const key = keyOf(t, row);
      if (after.has(key)) return;
      const body = JSON.stringify(row.json);
      const values = (cols: Column[]) => cols.map((c) => (c.name === 'json' ? body : row[c.name]));
      const keyValues = t.key.map((k) => row[k]);
      const old = before.get(key);
      if (!old) {
        const cols = ['tenant_id', 'version', ...(t.ordered ? ['pos'] : []), ...t.columns.map((c) => c.name)];
        const params = [TENANT, 1, ...(t.ordered ? [pos] : []), ...values(t.columns)];
        writes.push({ table: t.name, key, sql: `INSERT INTO ${t.name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT DO NOTHING`, params });
        after.set(key, { key: keyValues, version: 1, json: body, pos });
      } else if (old.json !== body) {
        const sets = [...valueColumns.map((c) => `${c.name} = ?`), ...(t.ordered ? ['pos = ?'] : []), 'version = version + 1'];
        const params = [...values(valueColumns), ...(t.ordered ? [pos] : []), TENANT, ...keyValues, old.version];
        writes.push({ table: t.name, key, sql: `UPDATE ${t.name} SET ${sets.join(', ')} WHERE ${where(t)} AND version = ?`, params });
        after.set(key, { key: keyValues, version: old.version + 1, json: body, pos });
      } else if (t.ordered && old.pos !== pos) {
        writes.push({ table: t.name, key, sql: `UPDATE ${t.name} SET pos = ? WHERE ${where(t)}`, params: [pos, TENANT, ...keyValues] });
        after.set(key, { ...old, pos });
      } else {
        after.set(key, old);
      }
    });
    for (const [key, old] of before) {
      if (after.has(key)) continue;
      writes.push({ table: t.name, key, sql: `DELETE FROM ${t.name} WHERE ${where(t)} AND version = ?`, params: [TENANT, ...old.key, old.version] });
    }
    next.set(t.name, after);
  }
  return { writes, commit: () => (persisted = next) };
}

/** SQLite hands back JSON text; PostgreSQL JSONB arrives parsed, where a string is a value rather than JSON. */
const decode = (value: unknown) => (pool ? value : JSON.parse(String(value)));

/** Rebuilds the state and the `persisted` map from rows read for this tenant. */
function ingest(read: (t: TableSpec) => JsonRecord[]): RelationalStateShape | null {
  const fresh = new Map<string, Map<string, Persisted>>();
  const bodies = new Map<string, unknown[]>();
  for (const t of VERSIONED) {
    const rows = read(t);
    const map = new Map<string, Persisted>();
    const list: unknown[] = [];
    for (const row of rows) {
      const parsed = decode(row.json);
      list.push(t.name === 'state_meta' ? [row.key, parsed] : parsed);
      map.set(keyOf(t, row), { key: t.key.map((k) => row[k]), version: Number(row.version), json: JSON.stringify(parsed), pos: Number(row.pos ?? 0) });
    }
    fresh.set(t.name, map);
    bodies.set(t.name, list);
  }
  persisted = fresh;
  const meta = bodies.get('state_meta') as [string, unknown][];
  if (meta.length === 0) return null;
  const state: JsonRecord = Object.fromEntries(meta);
  for (const [key, table] of Object.entries(COLLECTIONS)) state[key] = bodies.get(table);
  return state as RelationalStateShape;
}

const selectTenantRows = (t: TableSpec) => `SELECT * FROM ${t.name} WHERE tenant_id = ?${t.ordered ? ' ORDER BY pos' : ''}`;

// ---------------------------------------------------------------- conflicts

let conflictHandler: ((state: RelationalStateShape) => void) | null = null;
let conflicts = 0;
let lastConflict: string | null = null;

/** Called with the database's state after a write lost to another writer; the database wins. */
export function onStorageConflict(handler: (state: RelationalStateShape) => void) {
  conflictHandler = handler;
}

function reportConflict(error: StorageConflictError, state: RelationalStateShape | null) {
  conflicts += 1;
  lastConflict = `${new Date().toISOString()} ${error.table}/${error.key}`;
  console.warn(`[storage] ${error.message}. 저장소의 최신 상태로 다시 읽었습니다.`);
  if (state) conflictHandler?.(state);
}

// ---------------------------------------------------------------- SQLite

const sqlite = db!;
const statements = new Map<string, StatementSync>();
const stmt = (sql: string) => {
  let s = statements.get(sql);
  if (!s) statements.set(sql, (s = sqlite.prepare(sql)));
  return s;
};
const sqliteColumns = (table: string) => (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

function readV1State(read: (sql: string) => JsonRecord[]): RelationalStateShape | null {
  const meta = read('SELECT key, json FROM state_meta');
  if (meta.length === 0) return null;
  const state: JsonRecord = Object.fromEntries(meta.map((row) => [row.key, decode(row.json)]));
  for (const [key, table] of Object.entries(COLLECTIONS)) state[key] = read(`SELECT json FROM ${table}`).map((row) => decode(row.json));
  return state as RelationalStateShape;
}

const runSqliteWrites = (writes: Write[]) => {
  for (const w of writes) {
    if (Number(stmt(w.sql).run(...(w.params as never[])).changes) !== 1) throw new StorageConflictError(w.table, w.key);
  }
};

/** Version 1 tables had no tenant, version or position; their rows move to the current tenant. */
function migrateSqlite() {
  const officeColumns = sqliteColumns('offices');
  if (officeColumns.length === 0 || officeColumns.includes('tenant_id')) return;
  const old = readV1State((sql) => sqlite.prepare(sql).all() as JsonRecord[]);
  const hadLedger = sqliteColumns('ai_calls').length > 0;
  sqlite.exec('PRAGMA foreign_keys = OFF');
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    for (const t of APPEND_ONLY) {
      if (sqliteColumns(t.name).length === 0) continue;
      const cols = t.columns.map((c) => c.name).join(', ');
      sqlite.exec(createTableSql(t, false, `${t.name}_v2`));
      sqlite.prepare(`INSERT INTO ${t.name}_v2 (tenant_id, ${cols}) SELECT ?, ${cols} FROM ${t.name}`).run(TENANT);
      sqlite.exec(`DROP TABLE ${t.name}; ALTER TABLE ${t.name}_v2 RENAME TO ${t.name}`);
    }
    for (const t of VERSIONED) sqlite.exec(`DROP TABLE IF EXISTS ${t.name}`);
    for (const sql of schemaSql(false)) sqlite.exec(sql);
    if (!hadLedger) {
      for (const row of sqlite.prepare("SELECT json FROM events WHERE type = 'cost.recorded' AND tenant_id = ?").all(TENANT) as { json: string }[]) {
        insertSqliteLedger(JSON.parse(row.json) as OfficeEvent);
      }
    }
    persisted = new Map();
    if (old) {
      const plan = planWrites(old);
      runSqliteWrites(plan.writes);
      plan.commit();
    }
    sqlite.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(SCHEMA_VERSION, new Date().toISOString());
    sqlite.exec('COMMIT');
    console.log(`[storage] SQLite 저장 구조를 버전 ${SCHEMA_VERSION}(tenant "${TENANT}")로 옮겼습니다.`);
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}

const loadSqliteState = () => ingest((t) => stmt(selectTenantRows(t)).all(TENANT) as JsonRecord[]);

function saveSqlite(state: RelationalStateShape) {
  const plan = planWrites(state);
  if (plan.writes.length === 0) return;
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    runSqliteWrites(plan.writes);
    sqlite.exec('COMMIT');
    plan.commit();
  } catch (error) {
    sqlite.exec('ROLLBACK');
    if (!(error instanceof StorageConflictError)) throw error;
    reportConflict(error, loadSqliteState());
  }
}

// ---------------------------------------------------------------- PostgreSQL

let writeQueue: Promise<void> = Promise.resolve();
let lastWriteError: Error | null = null;
let pgState: RelationalStateShape | null = null;
let pgPending: RelationalStateShape | null = null;
let pgEvents: OfficeEvent[] = [];
let lockClient: PoolClient | null = null;
let lockHeld = false;
const pgKv = new Map<string, unknown>();

const pgSql = (sql: string) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

function enqueue(write: () => Promise<void>) {
  writeQueue = writeQueue.then(write).catch((error: unknown) => {
    lastWriteError = error instanceof Error ? error : new Error(String(error));
    console.error('[storage] PostgreSQL write failed:', lastWriteError);
  });
}

async function pgColumns(client: Pick<PoolClient, 'query'>, table: string) {
  const res = await client.query<{ column_name: string }>(
    'SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1',
    [table],
  );
  return res.rows.map((r) => r.column_name);
}

async function runPostgresWrites(client: PoolClient, writes: Write[]) {
  for (const w of writes) {
    const res = await client.query(pgSql(w.sql), w.params);
    if (res.rowCount !== 1) throw new StorageConflictError(w.table, w.key);
  }
}

async function migratePostgres(client: PoolClient) {
  const officeColumns = await pgColumns(client, 'offices');
  if (officeColumns.length === 0 || officeColumns.includes('tenant_id')) return;
  const old = readV1StateFromRows(await readPgV1(client));
  const hadLedger = (await pgColumns(client, 'ai_calls')).length > 0;
  for (const t of APPEND_ONLY) {
    if ((await pgColumns(client, t.name)).length === 0) continue;
    const cols = t.columns.map((c) => c.name).join(', ');
    await client.query(createTableSql(t, true, `${t.name}_v2`));
    await client.query(`INSERT INTO ${t.name}_v2 (tenant_id, ${cols}) SELECT $1::text, ${cols} FROM ${t.name}`, [TENANT]);
    await client.query(`DROP TABLE ${t.name} CASCADE`);
    await client.query(`ALTER TABLE ${t.name}_v2 RENAME TO ${t.name}`);
  }
  for (const t of VERSIONED) await client.query(`DROP TABLE IF EXISTS ${t.name} CASCADE`);
  for (const sql of schemaSql(true)) await client.query(sql);
  if (!hadLedger) {
    const costs = await client.query<{ json: OfficeEvent }>("SELECT json FROM events WHERE type = 'cost.recorded' AND tenant_id = $1", [TENANT]);
    for (const row of costs.rows) await insertPostgresLedger(client, row.json);
  }
  persisted = new Map();
  if (old) {
    const plan = planWrites(old);
    await runPostgresWrites(client, plan.writes);
    plan.commit();
  }
  console.log(`[storage] PostgreSQL 저장 구조를 버전 ${SCHEMA_VERSION}(tenant "${TENANT}")로 옮겼습니다.`);
}

async function readPgV1(client: PoolClient) {
  const rows = new Map<string, JsonRecord[]>();
  rows.set('SELECT key, json FROM state_meta', (await client.query('SELECT key, json FROM state_meta')).rows);
  for (const table of Object.values(COLLECTIONS)) rows.set(`SELECT json FROM ${table}`, (await client.query(`SELECT json FROM ${table}`)).rows);
  return rows;
}

const readV1StateFromRows = (rows: Map<string, JsonRecord[]>) => readV1State((sql) => rows.get(sql) ?? []);

async function loadPostgresState(client: Pick<PoolClient, 'query'>) {
  const rows = new Map<string, JsonRecord[]>();
  for (const t of VERSIONED) rows.set(t.name, (await client.query(pgSql(selectTenantRows(t)), [TENANT])).rows);
  return ingest((t) => rows.get(t.name) ?? []);
}

/** One writer per tenant: a session-level advisory lock held for the life of the process. */
async function acquireTenantLock() {
  lockClient = await pool!.connect();
  lockClient.on('error', (error) => {
    lockHeld = false;
    lastWriteError = new Error(`tenant 잠금 연결이 끊겼습니다: ${error.message}`);
  });
  // A server that just died can keep its session (and lock) for a few seconds until PostgreSQL notices.
  let ok = false;
  for (let attempt = 0; attempt < 30 && !ok; attempt++) {
    if (attempt === 1) console.log(`[storage] tenant "${TENANT}" 잠금을 기다리는 중…`);
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000));
    const res = await lockClient.query<{ ok: boolean }>('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [`avataragent:tenant:${TENANT}`]);
    ok = Boolean(res.rows[0]?.ok);
  }
  if (!ok) {
    lockClient.release(true);
    lockClient = null;
    await pool!.end();
    throw new Error(`다른 서버가 이미 tenant "${TENANT}"의 데이터를 쓰고 있습니다. 그 서버를 끄거나 TENANT_ID를 다르게 설정하세요.`);
  }
  lockHeld = true;
}

async function initializePostgres() {
  if (!pool) return;
  await acquireTenantLock();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['avataragent:schema']);
    await migratePostgres(client);
    for (const sql of schemaSql(true)) await client.query(sql);
    await client.query('INSERT INTO schema_migrations(version, applied_at) VALUES($1, NOW()) ON CONFLICT(version) DO NOTHING', [SCHEMA_VERSION]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  pgState = await loadPostgresState(pool);
  const events = await pool.query<{ json: OfficeEvent }>('SELECT json FROM events WHERE tenant_id = $1 ORDER BY seq DESC LIMIT 300', [TENANT]);
  pgEvents = events.rows.reverse().map((row) => row.json);
  const kv = await pool.query<{ key: string; json: unknown }>('SELECT key, json FROM kv WHERE tenant_id = $1', [TENANT]);
  for (const row of kv.rows) pgKv.set(row.key, row.json);
}

async function savePostgres() {
  const state = pgPending;
  pgPending = null;
  if (!state) return;
  const plan = planWrites(state);
  if (plan.writes.length === 0) return;
  const client = await pool!.connect();
  try {
    await client.query('BEGIN');
    await runPostgresWrites(client, plan.writes);
    await client.query('COMMIT');
    plan.commit();
    lastWriteError = null;
  } catch (error) {
    await client.query('ROLLBACK');
    if (!(error instanceof StorageConflictError)) throw error;
    pgPending = null;
    reportConflict(error, await loadPostgresState(client));
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------- public API

export function saveRelationalState(state: RelationalStateShape) {
  if (pool) {
    // Saves that pile up while one is running collapse into a single write of the newest state.
    const scheduled = pgPending !== null;
    pgPending = state;
    if (!scheduled) enqueue(savePostgres);
    return;
  }
  saveSqlite(state);
}

export function loadRelationalState<T>(): T | null {
  if (pool) return pgState as T | null;
  return loadSqliteState() as T | null;
}

const insertEventSql = 'INSERT INTO events (tenant_id, seq, event_id, type, task_id, json) VALUES (?, ?, ?, ?, ?, ?)';

export function appendEvent(event: OfficeEvent) {
  if (pool) {
    pgEvents.push(structuredClone(event));
    pgEvents = pgEvents.slice(-300);
    enqueue(async () => {
      await pool.query(pgSql(`${insertEventSql} ON CONFLICT DO NOTHING`), [TENANT, event.seq, event.eventId, event.type, event.taskId ?? null, event]);
      await insertPostgresLedger(pool, event);
    });
    return;
  }
  stmt(insertEventSql).run(TENANT, event.seq, event.eventId, event.type, event.taskId ?? null, JSON.stringify(event));
  insertSqliteLedger(event);
}

const upsertKvSql = 'INSERT INTO kv (tenant_id, key, json) VALUES (?, ?, ?) ON CONFLICT (tenant_id, key) DO UPDATE SET json = excluded.json';

export function saveKv(key: string, value: unknown) {
  if (pool) {
    pgKv.set(key, structuredClone(value));
    enqueue(() => pool.query(pgSql(upsertKvSql), [TENANT, key, JSON.stringify(value)]).then(() => undefined));
    return;
  }
  stmt(upsertKvSql).run(TENANT, key, JSON.stringify(value));
}

export function loadKv<T>(key: string): T | null {
  if (pool) return (pgKv.get(key) as T | undefined) ?? null;
  const row = stmt('SELECT json FROM kv WHERE tenant_id = ? AND key = ?').get(TENANT, key) as { json: string } | undefined;
  return row ? (JSON.parse(row.json) as T) : null;
}

export function recentEvents(limit: number): OfficeEvent[] {
  if (pool) return pgEvents.slice(-limit);
  const rows = stmt('SELECT json FROM events WHERE tenant_id = ? ORDER BY seq DESC LIMIT ?').all(TENANT, limit) as { json: string }[];
  return rows.map((r) => JSON.parse(r.json) as OfficeEvent).reverse();
}

export function maxSeq(): number {
  if (pool) return pgEvents.at(-1)?.seq ?? 0;
  return Number((stmt('SELECT COALESCE(MAX(seq), 0) AS seq FROM events WHERE tenant_id = ?').get(TENANT) as { seq: number }).seq);
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

const ledgerSql = {
  ai: 'INSERT INTO ai_calls (tenant_id, event_id, task_id, agent_id, purpose, input_tokens, output_tokens, cost_krw, occurred_at, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
  cost: 'INSERT INTO cost_entries (tenant_id, event_id, task_id, agent_id, amount_krw, occurred_at, json) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
};

function ledgerParams(event: OfficeEvent, body: unknown) {
  const item = ledger(event);
  const ids = [TENANT, event.eventId, event.taskId ?? null, event.agentId ?? null];
  return {
    ai: [...ids, item.purpose, item.inputTokens, item.outputTokens, item.amountKrw, event.timestamp, body],
    cost: [...ids, item.amountKrw, event.timestamp, body],
  };
}

function insertSqliteLedger(event: OfficeEvent) {
  if (event.type !== 'cost.recorded') return;
  const params = ledgerParams(event, JSON.stringify(event));
  stmt(ledgerSql.ai).run(...(params.ai as never[]));
  stmt(ledgerSql.cost).run(...(params.cost as never[]));
}

async function insertPostgresLedger(client: Pick<PoolClient, 'query'> | Pool, event: OfficeEvent) {
  if (event.type !== 'cost.recorded') return;
  const params = ledgerParams(event, event);
  await client.query(pgSql(ledgerSql.ai), params.ai);
  await client.query(pgSql(ledgerSql.cost), params.cost);
}

export async function flushStorage() {
  await writeQueue;
  if (lastWriteError) throw lastWriteError;
}

export function storageInfo() {
  return {
    backend: pool ? ('postgresql' as const) : ('sqlite' as const),
    tenantId: TENANT,
    schemaVersion: SCHEMA_VERSION,
    healthy: lastWriteError === null && (!pool || lockHeld),
    error: lastWriteError?.message ?? null,
    tenantLock: pool ? lockHeld : null,
    conflicts,
    lastConflict,
  };
}

export async function closeStorage() {
  await flushStorage();
  if (lockClient) {
    lockClient.release(true);
    lockClient = null;
    lockHeld = false;
  }
  await pool?.end();
  db?.close();
}

// ---------------------------------------------------------------- startup

if (db) {
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  migrateSqlite();
  for (const sql of schemaSql(false)) db.exec(sql);
  db.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(SCHEMA_VERSION, new Date().toISOString());
}
await initializePostgres();
