import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const dataDir = mkdtempSync(join(tmpdir(), 'avataragent-rows-'));
const file = join(dataDir, 'office.db');

const office = (id: string, name: string) => ({ id, team: 'dev', name });
const task = (id: string, createdAt: string) => ({ id, officeId: 'o1', status: 'queued', createdAt, plan: [{ id: `${id}_s1`, kind: 'brief', status: 'pending' }], artifacts: [] });
const baseState = () => ({
  version: 3,
  offices: [office('o2', '둘째'), office('o1', '첫째')],
  agents: [],
  tasks: [task('t_new', '2026-10-02T00:00:00Z'), task('t_old', '2026-10-01T00:00:00Z')],
  mailbox: [],
  calendar: [],
  inquiries: [],
  outbox: [],
  recommendations: [],
  shares: [],
  budget: { monthlyKrw: 1000 },
});

// A version 1 database: no tenant, version or position columns; rows in state order.
{
  const v1 = new DatabaseSync(file);
  v1.exec(`
    CREATE TABLE events (seq INTEGER PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, type TEXT NOT NULL, task_id TEXT, json TEXT NOT NULL);
    CREATE TABLE kv (key TEXT PRIMARY KEY, json TEXT NOT NULL);
    CREATE TABLE state_meta (key TEXT PRIMARY KEY, json TEXT NOT NULL);
    CREATE TABLE offices (id TEXT PRIMARY KEY, team TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE agents (id TEXT PRIMARY KEY, office_id TEXT NOT NULL, role TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE tasks (id TEXT PRIMARY KEY, office_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE mailbox (id TEXT PRIMARY KEY, received_at TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE calendar_events (id TEXT PRIMARY KEY, event_date TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE inquiries (id TEXT PRIMARY KEY, status TEXT NOT NULL, received_at TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE outbox (id TEXT PRIMARY KEY, approved_at TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE recommendations (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE share_links (id TEXT PRIMARY KEY, expires_at TEXT, json TEXT NOT NULL);
    CREATE TABLE workflow_steps (task_id TEXT NOT NULL, step_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (task_id, step_id));
    CREATE TABLE artifacts (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, step_id TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE ai_calls (event_id TEXT PRIMARY KEY, task_id TEXT, agent_id TEXT, purpose TEXT, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, cost_krw REAL NOT NULL, occurred_at TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE cost_entries (event_id TEXT PRIMARY KEY, task_id TEXT, agent_id TEXT, amount_krw REAL NOT NULL, occurred_at TEXT NOT NULL, json TEXT NOT NULL);
  `);
  const s = baseState();
  for (const o of s.offices) v1.prepare('INSERT INTO offices VALUES (?, ?, ?)').run(o.id, o.team, JSON.stringify(o));
  for (const t of s.tasks) v1.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?)').run(t.id, t.officeId, t.status, t.createdAt, JSON.stringify(t));
  v1.prepare('INSERT INTO state_meta VALUES (?, ?)').run('version', '3');
  v1.prepare('INSERT INTO state_meta VALUES (?, ?)').run('budget', JSON.stringify(s.budget));
  v1.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?)').run(1, 'evt_1', 'task.created', 't_old', JSON.stringify({ seq: 1, eventId: 'evt_1', type: 'task.created', payload: {} }));
  v1.prepare('INSERT INTO kv VALUES (?, ?)').run('secrets', JSON.stringify({ openai: 'x' }));
  v1.close();
}

process.env.DATA_DIR = dataDir;
process.env.TENANT_ID = 'alpha';
const storage = await import('../server/db.ts');
const raw = new DatabaseSync(file);
const versions = (table: string) =>
  Object.fromEntries((raw.prepare(`SELECT id, version, pos FROM ${table} WHERE tenant_id = 'alpha'`).all() as { id: string; version: number; pos: number }[]).map((r) => [r.id, [r.version, r.pos]]));

type State = ReturnType<typeof baseState>;
const load = () => storage.loadRelationalState<State>()!;
const save = (s: State) => storage.saveRelationalState(s as never);

test('버전 1 저장소를 tenant·버전·순서를 가진 구조로 옮긴다', () => {
  const s = load();
  assert.deepEqual(s.offices.map((o) => o.id), ['o2', 'o1']);
  assert.deepEqual(s.tasks.map((t) => t.id), ['t_new', 't_old']);
  assert.deepEqual(s.budget, { monthlyKrw: 1000 });
  assert.equal(storage.recentEvents(10).length, 1);
  assert.deepEqual(storage.loadKv('secrets'), { openai: 'x' });
  assert.equal(Number((raw.prepare("SELECT COUNT(*) AS n FROM workflow_steps WHERE tenant_id = 'alpha'").get() as { n: number }).n), 2);
  assert.ok(raw.prepare('SELECT version FROM schema_migrations WHERE version = 2').get());
});

test('바뀐 행만 버전을 올리고, 순서만 바뀌면 위치만 고친다', () => {
  const s = load();
  s.offices[1].name = '첫째(수정)';
  save(s);
  assert.deepEqual(versions('offices'), { o2: [1, 0], o1: [2, 1] });

  s.tasks.unshift(task('t_newest', '2026-10-03T00:00:00Z'));
  save(s);
  assert.deepEqual(versions('tasks'), { t_newest: [1, 0], t_new: [1, 1], t_old: [1, 2] });
  assert.deepEqual(load().tasks.map((t) => t.id), ['t_newest', 't_new', 't_old']);

  s.tasks = s.tasks.filter((t) => t.id !== 't_old');
  save(s);
  assert.deepEqual(Object.keys(versions('tasks')).sort(), ['t_new', 't_newest']);
  assert.equal(Number((raw.prepare("SELECT COUNT(*) AS n FROM workflow_steps WHERE task_id = 't_old'").get() as { n: number }).n), 0);
});

test('다른 쓰기가 먼저 바꾼 행은 덮어쓰지 않고 저장소 상태를 다시 읽는다', () => {
  const s = load();
  const outside = { ...s.offices[0], name: '다른 서버가 바꿈' };
  raw.prepare("UPDATE offices SET json = ?, version = version + 1 WHERE tenant_id = 'alpha' AND id = 'o2'").run(JSON.stringify(outside));

  let reloaded: State | null = null;
  storage.onStorageConflict((state) => (reloaded = state as unknown as State));
  s.offices[0].name = '이 서버가 바꿈';
  s.offices[1].name = '함께 바꾼 다른 행';
  save(s);

  assert.ok(reloaded, '충돌 시 저장소 상태를 넘겨줘야 한다');
  assert.equal((reloaded as State).offices[0].name, '다른 서버가 바꿈');
  assert.equal((reloaded as State).offices[1].name, '첫째(수정)', '충돌한 저장은 통째로 되돌린다');
  assert.equal(storage.storageInfo().conflicts, 1);

  // After reloading, the next save starts from the database's versions and succeeds.
  const next = load();
  next.offices[0].name = '다시 저장';
  save(next);
  assert.equal(load().offices[0].name, '다시 저장');
  assert.equal(storage.storageInfo().conflicts, 1);
});

test('다른 tenant의 행은 읽지도 지우지도 않는다', () => {
  raw.prepare("INSERT INTO offices (tenant_id, version, pos, id, team, json) VALUES ('beta', 1, 0, 'o1', 'hr', ?)").run(JSON.stringify(office('o1', '베타 회사')));
  const s = load();
  assert.deepEqual(s.offices.map((o) => o.name).includes('베타 회사'), false);
  s.offices = s.offices.filter((o) => o.id !== 'o1');
  save(s);
  const beta = raw.prepare("SELECT json FROM offices WHERE tenant_id = 'beta' AND id = 'o1'").get() as { json: string } | undefined;
  assert.equal(JSON.parse(beta!.json).name, '베타 회사');
  assert.equal(raw.prepare("SELECT 1 FROM offices WHERE tenant_id = 'alpha' AND id = 'o1'").get(), undefined);
});
