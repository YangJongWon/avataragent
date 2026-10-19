import { importGmail } from './gmail.ts';
import { importImap, sortMail } from './mail-imap.ts';
import { mailKindOf, type MailKind } from '../shared/mail-sort.ts';
import type { Task } from '../shared/types.ts';
import { parseHr } from './teams.ts';
import { V } from './text.ts';
import { store } from './store.ts';

/**
 * New mail for a mail office from every source feeding it: its mail accounts (IMAP) and a Gmail MCP server it reads.
 * One source failing doesn't stop the others; if every one fails, the first reason is thrown.
 */
export async function importMail(officeId: string): Promise<number> {
  const office = store.office(officeId);
  if (office.team !== 'hr') throw new Error('메일은 메일 관리 사무실에만 가져올 수 있어요.');
  const jobs = [
    ...store.data.mailAccounts.filter((a) => a.officeId === office.id).map((a) => () => importImap(a.id)),
    ...(office.gmailServerId ? [() => importGmail(office.id)] : []),
  ];
  if (!jobs.length) throw new Error('이 사무실에 연결된 메일이 없어요. MCP 관리의 "📮 메일 계정"에서 추가해 주세요.');
  let added = 0;
  const errors: string[] = [];
  for (const job of jobs) {
    try {
      added += await job();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (errors.length === jobs.length) throw new Error(errors[0]);
  for (const reason of errors) console.error(`[mail] ${office.name}:`, reason);
  return added;
}

/** Every few minutes, mail offices that check on their own pull new mail; the next tick starts the work. */
export async function mailTick() {
  for (const office of store.data.offices) {
    if (office.team !== 'hr' || !office.autoRun) continue;
    if (!office.gmailServerId && !store.data.mailAccounts.some((a) => a.officeId === office.id)) continue;
    try {
      await importMail(office.id);
    } catch (error) {
      // Signed out or offline: the next round tries again, and the fetch button shows the reason.
      console.error(`[mail] ${office.name}:`, error instanceof Error ? error.message : error);
    }
  }
}

/**
 * After a mail report is approved: labels and archives the mail that came from connected accounts, as the report
 * sorted it, account by account. Returns a line for the approval notice ('' when there was nothing to do); failures
 * are reported there too rather than undoing the approval.
 */
export async function applyMailSorting(task: Task, json: string | null): Promise<string> {
  if (store.office(task.officeId).team !== 'hr') return '';
  const byAccount = new Map<string, { uid: number; uidValidity: string; kind: MailKind }[]>();
  for (const s of parseHr(json).summaries) {
    const mail = store.data.mailbox.find((m) => m.id === s.mailId && task.inputIds.includes(m.id));
    const kind = mailKindOf(s);
    if (!mail?.remote || !kind) continue;
    const { accountId, uid, uidValidity } = mail.remote;
    byAccount.set(accountId, [...(byAccount.get(accountId) ?? []), { uid, uidValidity, kind }]);
  }
  if (!byAccount.size) return '';
  let labeled = 0;
  let archived = 0;
  let missing = 0;
  const failures: string[] = [];
  for (const [accountId, items] of byAccount) {
    try {
      const r = await sortMail(accountId, items);
      labeled += r.labeled || r.archived;
      archived += r.archived;
      missing += r.missing;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  return [
    labeled || archived ? V('실제 메일함: {labeled}통 분류, {archived}통 보관', { labeled, archived }) : '',
    missing ? V('{n}통은 메일함에서 찾지 못했어요', { n: missing }) : '',
    ...failures.map((reason) => V('실제 메일함 정리 실패: {reason}', { reason })),
  ]
    .filter(Boolean)
    .join(' · ');
}
