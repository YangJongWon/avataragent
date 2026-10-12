import assert from 'node:assert/strict';
import test from 'node:test';

const { DEFAULT_COMPANIES, DEFAULT_MODELS, setCatalog, tierLabel, tierLook, tierScale, tiersInUse } = await import('../shared/models.ts');
const { parsePlaybook } = await import('../shared/playbook.ts');

const withTiers = (extra: { id: string; vendor: string; tier: number }[]) =>
  setCatalog(DEFAULT_COMPANIES, [
    ...DEFAULT_MODELS,
    ...extra.map((m) => ({ ...m, label: m.id, apiModel: m.id, priceInPerMTokUsd: 1, priceOutPerMTokUsd: 1 })),
  ]);

test('with the built-in 1 to 3 tiers nothing changes', () => {
  withTiers([]);
  assert.deepEqual(tiersInUse(), [1, 2, 3]);
  assert.deepEqual([1, 2, 3].map(tierLook), [1, 2, 3]);
  assert.deepEqual([1, 2, 3].map(tierScale), [1, 2, 3]);
  assert.equal(tierLabel(3), '최상위');
});

test('a tier above the rest becomes the top; the old top moves between', () => {
  withTiers([{ id: 'claude-next', vendor: 'claude', tier: 5 }]);
  assert.deepEqual(tiersInUse(), [1, 2, 3, 5]);
  assert.equal(tierLook(5), 3);
  assert.equal(tierLook(3), 2, 'the old top no longer wears the aura');
  assert.equal(tierLook(1), 1);
  assert.equal(tierScale(5), 3, 'scores stay within what 1 to 3 gave');
  assert.equal(tierScale(3), 2);
  assert.match(tierLabel(5), /5/, 'with more than three tiers the number shows');
  withTiers([]);
});

test('a playbook keeps where its model stood, and old files read their 1 to 3 tier as that', () => {
  const read = (extra: object) =>
    parsePlaybook({
      format: 'avataragent-playbook',
      version: 1,
      team: 'dev',
      staff: [{ role: 'researcher', personality: 'balanced', rules: '', modelVendor: 'claude', modelLabel: 'X', ...extra }],
    }).staff[0];
  assert.deepEqual([read({ modelTier: 7, modelTierLook: 3 }).modelTier, read({ modelTier: 7, modelTierLook: 3 }).modelTierLook], [7, 3]);
  assert.equal(read({ modelTier: 3 }).modelTierLook, 3);
  assert.equal(read({ modelTier: 2 }).modelTierLook, 2);
  assert.equal(read({ modelTier: 1 }).modelTierLook, 1);
  assert.equal(read({ modelTier: 'x' }).modelTier, 2);
});
