import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-recommend-'));
process.env.AI_PROVIDER = 'mock';
process.env.MOCK_DELAY_MS = '0';
process.env.SITE_URL = 'https://site.test';

const { store } = await import('../server/store.ts');
const { clearPopularCache, popularFlows, saveFlow, setCommunityFetch } = await import('../server/community.ts');
const { recommendFlows, suggestInstructions, suggestPrompt } = await import('../server/recommend.ts');
const { flowFromPlan } = await import('../shared/flow-pack.ts');
const { templatePlan } = await import('../shared/workflow.ts');

const OFFICE = 'office_dev';
const agents = () => store.data.agents.filter((a) => a.officeId === OFFICE);
// The default staff run free models; a paid one makes the charge visible.
for (const agent of agents()) agent.model = 'claude-sonnet';

let siteCalls = 0;
function fakeSite(items: Record<string, unknown>[]) {
  siteCalls = 0;
  clearPopularCache();
  setCommunityFetch(async (input) => {
    siteCalls += 1;
    assert.match(String(input), /^https:\/\/site\.test\/api\/items\?type=flow&sort=popular/);
    return Response.json({ items, total: items.length });
  });
}

test('popular community flows are cached, and an unreachable site just gives none', async () => {
  fakeSite([{ id: 'itm_competitor01', title: '경쟁사 비교 보고서', summary: '경쟁사 3곳을 표로 비교', tags: ['비교'], likes: 9, downloads: 40, owner: { handle: 'mina' } }]);
  const first = await popularFlows();
  assert.deepEqual(first.map((f) => [f.id, f.owner]), [['itm_competitor01', 'mina']]);
  await popularFlows();
  assert.equal(siteCalls, 1, 'the second call comes from the cache');

  clearPopularCache();
  setCommunityFetch(async () => {
    throw new TypeError('fetch failed');
  });
  assert.deepEqual(await popularFlows(), []);
});

test('flow recommendations pick saved and community flows that match the request, with reasons', async () => {
  fakeSite([
    { id: 'itm_competitor01', title: '경쟁사 비교 보고서', summary: '경쟁사 3곳을 표로 비교하고 근거를 단다', tags: ['비교', '경쟁사'], likes: 9, downloads: 40 },
    { id: 'itm_newsletter01', title: '사내 뉴스레터', summary: '한 주 소식을 짧게', tags: ['뉴스레터'], likes: 3, downloads: 5 },
  ]);
  const plan = templatePlan('dev', '', agents());
  saveFlow(flowFromPlan(plan, agents(), { name: '보안 점검 체크리스트', description: '취약점 점검과 보안 체크리스트' }), 'mine');

  const before = store.data.offices.find((o) => o.id === OFFICE)!.spentKrw;
  const result = await recommendFlows({ officeId: OFFICE, title: '경쟁사 비교', description: '경쟁사 3곳의 가격을 비교해 주세요', taskType: '' });
  assert.equal(result.picks[0].source, 'community');
  assert.equal(result.picks[0].id, 'itm_competitor01');
  assert.match(result.picks[0].reason, /경쟁사|비교/);
  assert.ok(!result.picks.some((p) => p.id === 'itm_newsletter01'), 'unrelated flows are left out');
  assert.ok(store.data.offices.find((o) => o.id === OFFICE)!.spentKrw > before, 'the call is charged to the office');

  const security = await recommendFlows({ officeId: OFFICE, title: '보안 점검', description: '', taskType: '' });
  assert.equal(security.picks[0].source, 'saved');
  assert.equal(security.picks[0].name, '보안 점검 체크리스트');

  const none = await recommendFlows({ officeId: OFFICE, title: '김장', description: '배추 절이기', taskType: '' });
  assert.deepEqual(none.picks, []);
  assert.match(none.note, /AI/);
});

test('a clearer request keeps the facts and asks for what is missing', async () => {
  const s = await suggestPrompt({ officeId: OFFICE, title: '경쟁사 비교', description: '가격 비교', taskType: '' });
  assert.equal(s.title, '경쟁사 비교');
  assert.match(s.description, /목표:/);
  assert.match(s.description, /가격 비교/, 'what the person wrote stays');
  assert.ok(s.tips.length > 0 && s.tips.length <= 3);
});

test('step instructions fill only empty steps and leave approval alone', async () => {
  const steps = templatePlan('dev', '', agents()).map((s, i) => (i === 1 ? { ...s, instructions: '내가 쓴 지시' } : s));
  const filled = await suggestInstructions({ officeId: OFFICE, title: '경쟁사 비교', description: '', taskType: '', steps });
  assert.equal(filled.length, steps.length);
  assert.equal(filled[1].instructions, '내가 쓴 지시');
  assert.ok(filled.filter((s) => s.kind !== 'approval').every((s) => s.instructions.length > 0));
  assert.equal(filled.at(-1)!.instructions, '');
  const broken = await suggestInstructions({ officeId: OFFICE, title: '', description: '', taskType: '', steps: [{ kind: 'nope' } as never, ...steps] });
  assert.equal(broken.length, steps.length, 'unknown steps are dropped instead of breaking');
});
