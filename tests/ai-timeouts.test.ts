import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-timeouts-'));
process.env.AI_TIMEOUT_MS = '60000';

const { store } = await import('../server/store.ts');

test('free models get a longer time limit by default, and the owner can set both or go back to the defaults', () => {
  assert.deepEqual(store.aiTimeouts, { paidSec: 60, freeSec: 180, defaults: { paidSec: 60, freeSec: 180 } });

  store.mutate((s) => {
    s.aiTimeoutSec = { paid: 90, free: 600 };
  });
  assert.equal(store.aiTimeouts.paidSec, 90);
  assert.equal(store.aiTimeouts.freeSec, 600);

  store.mutate((s) => {
    s.aiTimeoutSec = { paid: null, free: 300 };
  });
  assert.equal(store.aiTimeouts.paidSec, 60, 'a cleared limit falls back to .env');
  assert.equal(store.aiTimeouts.freeSec, 300);
});
