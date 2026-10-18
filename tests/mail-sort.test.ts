import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { startFakeImap } from './fake-imap.ts';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-mailsort-'));
process.env.AI_PROVIDER = 'mock';

const now = new Date();
const mail = (uid: number, subject: string) => ({
  uid,
  date: now,
  raw: [`From: sender${uid}@example.com`, `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`, `Date: ${now.toUTCString()}`, 'Content-Type: text/plain; charset=utf-8', '', `${subject} 본문`, ''].join('\n'),
});
const inbox = () => [mail(1, '다음 주 협업 미팅'), mail(2, '견적서 회신 요청'), mail(3, '분기 실적 공유'), mail(4, '최대 70% 할인')];
const gmail = await startFakeImap('me@gmail.com', 'pw', inbox(), { gmail: true });
const naver = await startFakeImap('me@naver.com', 'pw', inbox());

const { store } = await import('../server/store.ts');
const { setMailPassword } = await import('../server/secrets.ts');
const { importImap } = await import('../server/mail-imap.ts');
const { applyMailSorting } = await import('../server/mail-sync.ts');
const { localize } = await import('../shared/i18n.ts');

after(async () => {
  await gmail.close();
  await naver.close();
});

/** The report the HR team would approve: one mail of each kind, the category in Japanese to show codes win. */
function approvedReport(subjectToId: Map<string, string>) {
  const pick = (subject: string, kind: string, category: string) => ({ mailId: subjectToId.get(subject), kind, category, summary: subject, action: '' });
  return JSON.stringify({
    summaries: [pick('다음 주 협업 미팅', 'event', '予定'), pick('견적서 회신 요청', 'request', '依頼'), pick('분기 실적 공유', 'info', '情報'), pick('최대 70% 할인', '', '広告')],
    events: [],
  });
}

async function connectAndRead(user: string, port: number) {
  store.updateOffice('office_hr', (o) => {
    o.mailAccount = { provider: 'custom', user, host: '127.0.0.1', port };
  });
  setMailPassword('office_hr', 'pw');
  store.mutate((s) => {
    s.mailbox = [];
  });
  await importImap('office_hr');
  const ids = new Map(store.data.mailbox.map((m) => [m.subject, m.id]));
  return { ids, task: { officeId: 'office_hr', inputIds: [...ids.values()] } as never };
}

test('Gmail: every sorted mail gets an AvatarCast label, and only info and ads leave the inbox', async () => {
  const { ids, task } = await connectAndRead('me@gmail.com', gmail.port);
  const line = localize(await applyMailSorting(task, approvedReport(ids)), 'ko');
  assert.match(line, /4통 분류, 2통 보관/);

  const labels = (uid: number) => gmail.messages.find((m) => m.uid === uid)!.labels ?? [];
  assert.ok(labels(1).includes('AvatarCast/일정') && labels(1).includes('\\Inbox'), 'an event stays in the inbox');
  assert.ok(labels(2).includes('AvatarCast/회신 필요') && labels(2).includes('\\Inbox'));
  assert.ok(labels(3).includes('AvatarCast/정보') && !labels(3).includes('\\Inbox'), 'info is archived');
  assert.ok(labels(4).includes('AvatarCast/광고') && !labels(4).includes('\\Inbox'), 'the category alone ("広告") is enough');
  assert.ok(!gmail.commands.some((c) => /\\Seen|\\Deleted|EXPUNGE/i.test(c)), 'nothing is marked read or deleted');
});

test('other services: mail that is done moves into an AvatarCast folder, the rest stays put', async () => {
  const { ids, task } = await connectAndRead('me@naver.com', naver.port);
  const line = localize(await applyMailSorting(task, approvedReport(ids)), 'ko');
  assert.match(line, /2통 보관/);
  const where = (uid: number) => naver.messages.find((m) => m.uid === uid)!.movedTo;
  assert.equal(where(1), undefined);
  assert.equal(where(2), undefined);
  assert.equal(where(3), 'AvatarCast/정보');
  assert.equal(where(4), 'AvatarCast/광고');
  assert.ok(naver.folders.has('AvatarCast/광고'));

  // Running the same approval again finds nothing left to move and says so instead of failing.
  const again = localize(await applyMailSorting(task, approvedReport(ids)), 'ko');
  assert.match(again, /2통은 메일함에서 찾지 못했어요/);
});
