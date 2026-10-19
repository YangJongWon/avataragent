import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { startFakeImap } from './fake-imap.ts';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-mailoffices-'));
process.env.AI_PROVIDER = 'mock';

const now = new Date();
const mail = (uid: number, subject: string) => ({
  uid,
  date: now,
  raw: [`From: s${uid}@example.com`, `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`, `Date: ${now.toUTCString()}`, 'Content-Type: text/plain; charset=utf-8', '', subject, ''].join('\n'),
});
const company = await startFakeImap('info@company.com', 'pw', [mail(1, '제휴 문의'), mail(2, '세금계산서 발행 요청')]);
const recruiting = await startFakeImap('jobs@company.com', 'pw', [mail(1, '지원서 제출합니다')]);
const personal = await startFakeImap('ceo@gmail.com', 'pw', [mail(7, '다음 주 미팅')]);

const { store } = await import('../server/store.ts');
const { setMailPassword } = await import('../server/secrets.ts');
const { importMail } = await import('../server/mail-sync.ts');
const { TEAM_SPECS } = await import('../server/teams.ts');
const { autoRunOffices, simulateMail } = await import('../server/orchestrator.ts');

after(async () => {
  await company.close();
  await recruiting.close();
  await personal.close();
});

test('several mail offices each keep their own mailbox, fed by any number of accounts', async () => {
  // A second mail office, as "+ 사무실" makes one.
  const hr = store.office('office_hr');
  store.mutate((s) => {
    s.offices.push({ ...structuredClone(hr), id: 'office_jobs', name: '채용팀', custom: true, autoRun: true });
    for (const a of s.agents.filter((x) => x.officeId === hr.id)) s.agents.push({ ...structuredClone(a), id: `${a.id}_jobs`, officeId: 'office_jobs' });
    s.mailbox = [];
    s.mailAccounts = [
      { id: 'acc_company', officeId: 'office_hr', provider: 'custom', user: 'info@company.com', host: '127.0.0.1', port: company.port },
      { id: 'acc_ceo', officeId: 'office_hr', provider: 'custom', user: 'ceo@gmail.com', host: '127.0.0.1', port: personal.port },
      { id: 'acc_jobs', officeId: 'office_jobs', provider: 'custom', user: 'jobs@company.com', host: '127.0.0.1', port: recruiting.port },
    ];
  });
  for (const id of ['acc_company', 'acc_ceo', 'acc_jobs']) setMailPassword(id, 'pw');

  assert.equal(await importMail('office_hr'), 3, 'both accounts of one office');
  assert.equal(await importMail('office_jobs'), 1);
  const subjects = (officeId: string) => store.data.mailbox.filter((m) => m.officeId === officeId).map((m) => m.subject).sort();
  assert.deepEqual(subjects('office_hr'), ['다음 주 미팅', '세금계산서 발행 요청', '제휴 문의']);
  assert.deepEqual(subjects('office_jobs'), ['지원서 제출합니다']);

  // Each office's team sorts only its own mail, and both can work at once.
  const hrInputs = TEAM_SPECS.hr.gatherInputs('', 'office_hr');
  const jobsInputs = TEAM_SPECS.hr.gatherInputs('', 'office_jobs');
  assert.equal(hrInputs.count, 3);
  assert.equal(jobsInputs.count, 1);
  assert.doesNotMatch(jobsInputs.text, /제휴 문의/);
  store.updateOffice('office_hr', (o) => {
    o.autoRun = true;
  });
  assert.deepEqual(autoRunOffices().map((o) => o.id).sort(), ['office_hr', 'office_jobs']);

  // Simulated mail goes to the office it was sent to.
  simulateMail('office_jobs');
  assert.equal(store.data.mailbox.filter((m) => m.officeId === 'office_jobs').length, 2);

  // Closing an office takes its mailbox and accounts with it.
  store.removeOffice('office_jobs');
  assert.equal(store.data.mailbox.some((m) => m.officeId === 'office_jobs'), false);
  assert.deepEqual(store.data.mailAccounts.map((a) => a.id), ['acc_company', 'acc_ceo']);
});

test('a mail office can keep its own calendar; the others keep sharing the company one', async () => {
  const { calendarOf } = await import('../shared/types.ts');
  const approve = (officeId: string, title: string) =>
    TEAM_SPECS.hr.onApprove(
      JSON.stringify({ summaries: [], events: [{ mailId: '', title, date: '2026-11-02', start: '10:00', end: '11:00', location: '' }] }),
      { officeId, inputIds: [] } as never,
    );
  store.mutate((s) => {
    s.calendar = [];
    s.offices.push({ ...structuredClone(s.offices.find((o) => o.id === 'office_hr')!), id: 'office_sales_mail', name: '영업 메일', custom: true, ownCalendar: true });
  });
  approve('office_hr', '파트너 미팅');
  approve('office_sales_mail', '고객사 방문');
  approve('office_sales_mail', '고객사 방문');

  const hr = store.office('office_hr');
  const sales = store.office('office_sales_mail');
  assert.deepEqual(calendarOf(store.data.calendar, hr).map((e) => e.title), ['파트너 미팅'], 'the company calendar');
  assert.deepEqual(calendarOf(store.data.calendar, sales).map((e) => e.title), ['고객사 방문'], 'its own, without duplicates');
  // Welfare reads the company calendar unless it keeps its own too.
  assert.deepEqual(calendarOf(store.data.calendar, store.office('office_welfare')).map((e) => e.title), ['파트너 미팅']);
});
