import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-help-'));
process.env.AI_PROVIDER = 'mock';

const { answerHelp, searchHelp } = await import('../server/help.ts');
const { MCP_PRESETS, isOAuthClientSecret } = await import('../shared/mcp.ts');

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
