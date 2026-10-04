import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-help-'));
process.env.AI_PROVIDER = 'mock';

const { answerHelp, searchHelp } = await import('../server/help.ts');
const { MCP_PRESETS, isOAuthClientSecret } = await import('../shared/mcp.ts');
const { companyLinks } = await import('../shared/models.ts');

test('help search finds the section a question is about', () => {
  const top = (q: string, tab = '') => searchHelp(q, tab, 1)[0]?.title ?? '';
  assert.match(top('MCP slack 연결하려면?', 'mcp'), /Slack 연결하기/);
  assert.match(top('파워포인트로 받고 싶어'), /내보내기/);
  assert.match(top('실제 AI로 바꾸려면?', 'models'), /모델 관리|처음 시작하기/);
  assert.match(top('비밀번호 바꾸기'), /비밀번호/);
  assert.equal(searchHelp('zzqx qqzz').length, 0);
});

test('without a real AI the matching docs are shown as they are', async () => {
  const res = await answerHelp({ question: '슬랙 연결', tab: 'mcp', officeId: 'office_dev' }, true);
  assert.equal(res.ai, false);
  assert.match(res.answer, /mcp\.slack\.com/);
  assert.ok(res.sources.length >= 1);
  await assert.rejects(answerHelp({ question: '   ' }, false), /질문/);
});

test('Slack connects over OAuth with a client the user registers', () => {
  const slack = MCP_PRESETS.find((p) => p.id === 'slack')!;
  assert.equal(slack.url, 'https://mcp.slack.com/mcp');
  assert.equal(slack.oauth, true);
  assert.ok(slack.secrets.every((s) => isOAuthClientSecret(s.name)));
});

test('Gmail asks for read and draft scopes and keeps them out of headers', () => {
  const gmail = MCP_PRESETS.find((p) => p.id === 'gmail')!;
  assert.equal(gmail.url, 'https://gmailmcp.googleapis.com/mcp/v1');
  assert.equal(gmail.oauth, true);
  assert.ok(gmail.secrets.every((s) => isOAuthClientSecret(s.name)));
  const scopes = gmail.secrets.find((s) => s.name === 'OAUTH_SCOPES')?.value ?? '';
  assert.match(scopes, /gmail\.readonly/);
  assert.match(scopes, /gmail\.compose/);
  assert.doesNotMatch(scopes, /gmail\.send|mail\.google\.com/);
});

test('presets and companies link to the pages where keys are made', () => {
  for (const preset of MCP_PRESETS) assert.ok(preset.links?.length, `${preset.id} has links`);
  assert.ok(preset('gmail').links!.every((l) => l.url.startsWith('https://console.cloud.google.com/')));
  assert.match(companyLinks({ api: 'openai', baseUrl: '' })[0].url, /platform\.openai\.com/);
  assert.match(companyLinks({ api: 'openai_compatible', baseUrl: 'https://api.deepseek.com/v1/' })[0].url, /deepseek/);
  assert.deepEqual(companyLinks({ api: 'openai_compatible', baseUrl: 'https://example.com/v1' }), []);
});

function preset(id: string) {
  return MCP_PRESETS.find((p) => p.id === id)!;
}
