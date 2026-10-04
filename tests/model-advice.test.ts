import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-advice-'));
process.env.AI_PROVIDER = 'mock';

const { adviseModel, labelFromId } = await import('../server/model-advice.ts');
const { DEFAULT_PERSONALITY_BY_ROLE, PERSONALITIES, isPersonality } = await import('../shared/personality.ts');
const { store } = await import('../server/store.ts');

const noKey = () => '';
const withKey = () => 'test-key';
const never = async () => {
  throw new Error('must not call the AI');
};

test('without a key the reference table or the name fills the model', async () => {
  const mini = await adviseModel('gpt', 'gpt-5-mini', { ask: never, keyFor: noKey });
  assert.equal(mini.source, 'table');
  assert.equal(mini.tier, 1);
  assert.equal(mini.priceOutPerMTokUsd, 2);

  const unknown = await adviseModel('claude', 'some-new-ultra-model', { ask: never, keyFor: noKey });
  assert.equal(unknown.source, 'guess');
  assert.equal(unknown.tier, 3);
  assert.equal(labelFromId('gemini-2.5-flash-preview'), 'Gemini 2.5 Flash');
});

test('with a key the model is asked and its answer wins, with the table kept for comparison', async () => {
  const asked: string[] = [];
  const advice = await adviseModel('gpt', 'gpt-5', {
    keyFor: withKey,
    ask: async (req) => {
      asked.push(req.model.apiModel);
      assert.equal(req.direct, true);
      return { text: '{"label":"GPT-5","tier":2,"priceInPerMTokUsd":1.5,"priceOutPerMTokUsd":12,"note":"추정"}', inputTokens: 1, outputTokens: 1 };
    },
  });
  assert.deepEqual(asked, ['gpt-5']);
  assert.equal(advice.source, 'ai');
  assert.equal(advice.priceInPerMTokUsd, 1.5);
  assert.deepEqual(advice.reference, { priceInPerMTokUsd: 1.25, priceOutPerMTokUsd: 10 });
});

test('a model that cannot chat hands the question to a sibling, then falls back', async () => {
  const asked: string[] = [];
  const advice = await adviseModel('gpt', 'text-embedding-3-small', {
    keyFor: withKey,
    ask: async (req) => {
      asked.push(req.model.apiModel);
      if (req.model.apiModel === 'text-embedding-3-small') throw new Error('not a chat model');
      return { text: 'not json at all', inputTokens: 1, outputTokens: 1 };
    },
  });
  assert.equal(asked.length, 2);
  assert.equal(asked[1], 'gpt-5-mini');
  assert.equal(advice.source, 'guess');
});

test('every agent has a working style, defaulting by role', () => {
  assert.equal(PERSONALITIES.length, 6);
  assert.ok(store.data.agents.every((a) => isPersonality(a.personality)));
  const reviewer = store.data.agents.find((a) => a.role === 'reviewer')!;
  assert.equal(reviewer.personality, DEFAULT_PERSONALITY_BY_ROLE.reviewer);
});
