import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { startFakeImap } from './fake-imap.ts';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-imap-'));
process.env.AI_PROVIDER = 'mock';

const now = new Date();
const mail = (uid: number, from: string, subject: string, body: string) => ({
  uid,
  date: now,
  raw: [`From: ${from}`, 'To: me@company.com', `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`, `Date: ${now.toUTCString()}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', body, ''].join('\n'),
});
const imap = await startFakeImap('me@company.com', 'abcdefghijklmnop', [
  mail(11, '김민지 <kim@partner.com>', '다음 주 협업 미팅 제안', '화요일 오후 2시에 회의실 A에서 뵐까요?'),
  mail(12, 'choi@vendor.com', '견적서 회신 요청', '첨부한 견적서를 이번 주 안에 확인 부탁드립니다.'),
]);

const { store } = await import('../server/store.ts');
const { setMailPassword } = await import('../server/secrets.ts');
const { checkMailAccount, importImap } = await import('../server/mail-imap.ts');
const { TEAM_SPECS } = await import('../server/teams.ts');

after(() => imap.close());

test('a mail account is read over IMAP: new messages once, read-only, as outside material', async () => {
  const account = { provider: 'custom' as const, user: 'me@company.com', host: '127.0.0.1', port: imap.port };
  await assert.rejects(checkMailAccount(account, 'wrong'), /로그인에 실패/);
  // Google shows app passwords in groups of four; the spaces don't matter.
  await checkMailAccount(account, 'abcd efgh ijkl mnop');

  store.updateOffice('office_hr', (o) => {
    o.mailAccount = account;
  });
  setMailPassword('office_hr', 'abcd efgh ijkl mnop');

  assert.equal(await importImap('office_hr'), 2);
  const imported = store.data.mailbox.filter((m) => m.source === 'imap');
  assert.deepEqual(imported.map((m) => m.subject), ['견적서 회신 요청', '다음 주 협업 미팅 제안'], 'newest on top');
  const meeting = imported.find((m) => m.subject.includes('미팅'))!;
  assert.equal(meeting.from, '김민지 <kim@partner.com>');
  assert.match(meeting.body, /회의실 A/);
  assert.ok(imap.commands.some((c) => c.startsWith('EXAMINE')), 'the inbox is opened read-only');
  assert.ok(!imap.commands.some((c) => /STORE|EXPUNGE|COPY|MOVE/.test(c)), 'nothing is changed on the mail side');

  assert.equal(await importImap('office_hr'), 0, 'the same messages are not read twice');

  const inputs = TEAM_SPECS.hr.gatherInputs('');
  assert.match(inputs.text, /외부에서 온 내용/);
  assert.ok(inputs.ids.includes(meeting.id));
});
