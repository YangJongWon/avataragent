import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-quota-'));

const { freeQuota, noteFreeExhausted, noteFreeRequest, startFreeQuotaSync, syncFreeQuota } = await import('../server/free-quota.ts');

test('the free-model count is what OpenRouter reports for the key, with the office counting on top in between', async () => {
  let reply: unknown = { data: { is_free_tier: true, free_model_daily_requests: { used: 7, limit: 50, remaining: 43 } } };
  const asked: string[] = [];
  startFreeQuotaSync(
    () => 'sk-or-test',
    async (url, init) => {
      asked.push(`${url} ${new Headers(init?.headers).get('authorization')}`);
      return Response.json(reply);
    },
  );
  await syncFreeQuota();
  assert.equal(asked.at(-1), 'https://openrouter.ai/api/v1/key Bearer sk-or-test');
  assert.deepEqual({ used: freeQuota().used, limit: freeQuota().limit }, { used: 7, limit: 50 });
  assert.ok(freeQuota().checkedAt);
  assert.equal(new Date(freeQuota().resetsAt).getUTCHours(), 0);

  noteFreeRequest();
  assert.equal(freeQuota().used, 8, 'counted at once, before OpenRouter is asked again');

  reply = { data: { is_free_tier: true, free_model_daily_requests: { used: 7, limit: 50, remaining: 43 } } };
  await syncFreeQuota();
  assert.equal(freeQuota().used, 8, 'a lagging answer does not take back a request already counted');

  reply = { data: { is_free_tier: false, free_model_daily_requests: { used: 12, limit: 1000, remaining: 988 } } };
  await syncFreeQuota();
  assert.deepEqual({ used: freeQuota().used, limit: freeQuota().limit }, { used: 12, limit: 1000 });

  noteFreeExhausted();
  assert.equal(freeQuota().used, 1000, 'OpenRouter saying it is used up wins over the count');
});
