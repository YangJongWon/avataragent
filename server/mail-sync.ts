import { importGmail } from './gmail.ts';
import { importImap, sortMail } from './mail-imap.ts';
import { mailKindOf } from '../shared/mail-sort.ts';
import type { Task } from '../shared/types.ts';
import { parseHr } from './teams.ts';
import { V } from './text.ts';
import { store } from './store.ts';

/** New mail for an HR office from whatever its mailbox reads: a mail account (IMAP) or, advanced, a Gmail MCP server. */
export async function importMail(officeId: string): Promise<number> {
  const office = store.office(officeId);
  if (office.team !== 'hr') throw new Error('메일 계정은 인사팀 메일함에만 연결할 수 있어요.');
  if (office.mailAccount) return importImap(officeId);
  if (office.gmailServerId) return importGmail(officeId);
  throw new Error('연결된 메일 계정이 없어요. 팀 자료에서 메일 계정을 먼저 연결해 주세요.');
}

/** Every few minutes, HR offices that read real mail and check on their own pull new mail; the next tick starts the work. */
export async function mailTick() {
  for (const office of store.data.offices) {
    if (office.team !== 'hr' || !office.autoRun || (!office.mailAccount && !office.gmailServerId)) continue;
    try {
      await importMail(office.id);
    } catch (error) {
      // Signed out or offline: the next round tries again, and the button shows the reason.
      console.error(`[mail] ${office.name}:`, error instanceof Error ? error.message : error);
    }
  }
}

/**
 * After an HR mail report is approved: labels and archives the mail that came from the connected account, as the
 * report sorted it. Returns a line for the approval notice ('' when there was nothing to do); a failure is reported
 * there too rather than undoing the approval.
 */
export async function applyMailSorting(task: Task, json: string | null): Promise<string> {
  const office = store.office(task.officeId);
  if (office.team !== 'hr' || !office.mailAccount) return '';
  const items = parseHr(json).summaries.flatMap((s) => {
    const mail = store.data.mailbox.find((m) => m.id === s.mailId && task.inputIds.includes(m.id));
    const kind = mailKindOf(s);
    return mail?.remote && kind ? [{ ...mail.remote, kind }] : [];
  });
  if (!items.length) return '';
  try {
    const { labeled, archived, missing } = await sortMail(office.id, items);
    return [
      V('실제 메일함: {labeled}통 분류, {archived}통 보관', { labeled: labeled || archived, archived }),
      missing ? V('{n}통은 메일함에서 찾지 못했어요', { n: missing }) : '',
    ]
      .filter(Boolean)
      .join(' · ');
  } catch (error) {
    return V('실제 메일함 정리 실패: {reason}', { reason: error instanceof Error ? error.message : String(error) });
  }
}
