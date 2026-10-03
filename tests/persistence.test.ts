import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

test('상태를 관계형 테이블에 저장하고 연속 저장할 수 있다', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'avataragent-persistence-'));
  process.env.DATA_DIR = dataDir;
  process.env.AI_PROVIDER = 'mock';

  const { store } = await import('../server/store.ts');
  store.mutate(() => {});
  store.mutate(() => {});

  const db = new DatabaseSync(join(dataDir, 'office.db'));
  const count = (table: string) => Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
  assert.equal(count('offices'), store.data.offices.length);
  assert.equal(count('agents'), store.data.agents.length);
  assert.equal(count('tasks'), store.data.tasks.length);
  assert.ok(count('state_meta') >= 1);
  db.close();
});

