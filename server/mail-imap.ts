import { createHash } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { MailAccount } from '../shared/mail-providers.ts';
import { MAIL_SORT, SORT_ROOT, type MailKind } from '../shared/mail-sort.ts';
import type { Mail } from '../shared/types.ts';
import { loadKv, saveKv } from './db.ts';
import { mailPasswordFor } from './secrets.ts';
import { store } from './store.ts';

/**
 * The HR mailbox can read a real inbox over IMAP with an app password: Gmail, Naver, Daum or a company server. The inbox
 * is opened read-only, so nothing changes on the mail side (not even "read"); new messages join the mailbox the
 * simulation fills, and sorting, summaries and calendar entries work as before.
 */
const RECENT_DAYS = 2;
/** One import reads at most this many new messages; they all go into the next task's prompt. */
const MAX_NEW = 10;
/** Bytes of a message read for its text; long newsletters and attachments are cut off. */
const MAX_SOURCE = 200_000;
const MAX_BODY = 3000;
const MAX_SEEN = 1000;
const TIMEOUT_MS = 30_000;

const clientFor = (account: MailAccount, password: string) =>
  new ImapFlow({
    host: account.host,
    port: account.port,
    secure: account.port === 993,
    auth: { user: account.user, pass: password.replace(/\s+/g, '') },
    logger: false,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });

/** What went wrong, in words a person can act on. */
function explain(error: unknown, account: MailAccount) {
  const e = error as { authenticationFailed?: boolean; code?: string; message?: string; responseText?: string };
  if (e?.authenticationFailed) return `${account.user} 로그인에 실패했어요. 앱 비밀번호와, 메일 설정에서 IMAP 사용이 켜져 있는지 확인해 주세요.`;
  if (e?.code === 'ENOTFOUND' || e?.code === 'ECONNREFUSED' || e?.code === 'ETIMEDOUT') return `${account.host}:${account.port}에 연결하지 못했어요. 서버 주소와 포트를 확인해 주세요.`;
  return `메일 서버 오류: ${e?.responseText || e?.message || String(error)}`;
}

/** Logs in once to prove the account works before it is saved. */
export async function checkMailAccount(account: MailAccount, password: string) {
  const client = clientFor(account, password);
  client.on('error', () => {});
  try {
    await client.connect();
    await client.logout();
  } catch (error) {
    client.close();
    throw new Error(explain(error, account));
  }
}

/** What was already read, per office and account: another account's message numbers mean other messages. */
const seenKey = (officeId: string, account: MailAccount) => `mail_seen_${officeId}_${account.user}@${account.host}:${account.port}`;

export interface SortResult {
  labeled: number;
  archived: number;
  /** Messages no longer where they were read (moved, deleted, or the mailbox was rebuilt). */
  missing: number;
}

/**
 * Applies an approved sorting to the real inbox. Gmail gets real labels (X-GM-LABELS) and archiving drops only the
 * Inbox label; other services have no labels, so mail that is done moves into a folder and the rest stays put.
 */
export async function sortMail(officeId: string, items: { uid: number; uidValidity: string; kind: MailKind }[]): Promise<SortResult> {
  const account = store.office(officeId).mailAccount;
  if (!account) throw new Error('연결된 메일 계정이 없어요.');
  const result: SortResult = { labeled: 0, archived: 0, missing: 0 };
  if (!items.length) return result;
  const client = clientFor(account, mailPasswordFor(officeId));
  client.on('error', () => {});
  try {
    await client.connect();
    const gmail = client.capabilities.has('X-GM-EXT-1');
    const lock = await client.getMailboxLock('INBOX');
    try {
      const validity = String(client.mailbox ? client.mailbox.uidValidity : '');
      const present = new Set(((await client.search({ uid: items.map((i) => i.uid).join(',') }, { uid: true })) || []).map(Number));
      const made = new Set<string>();
      const place = async (name: string) => {
        if (!made.has(name)) {
          await client.mailboxCreate([SORT_ROOT, name]);
          made.add(name);
        }
        return `${SORT_ROOT}/${name}`;
      };
      for (const item of items) {
        if (item.uidValidity !== validity || !present.has(item.uid)) {
          result.missing++;
          continue;
        }
        const rule = MAIL_SORT[item.kind];
        const uid = String(item.uid);
        if (gmail) {
          await client.messageFlagsAdd(uid, [await place(rule.label)], { uid: true, useLabels: true });
          result.labeled++;
          if (rule.archive) {
            await client.messageFlagsRemove(uid, ['\\Inbox'], { uid: true, useLabels: true });
            result.archived++;
          }
        } else if (rule.archive) {
          // imapflow reports a refused move as false rather than an error.
          if (!(await client.messageMove(uid, await place(rule.label), { uid: true }))) throw new Error(`${SORT_ROOT}/${rule.label} 폴더로 옮기지 못했어요.`);
          result.archived++;
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (error) {
    client.close();
    throw new Error(explain(error, account));
  }
  return result;
}

/** Reads new inbox messages into the HR mailbox; returns how many arrived. */
export async function importImap(officeId: string): Promise<number> {
  const office = store.office(officeId);
  const account = office.mailAccount;
  if (!account) throw new Error('연결된 메일 계정이 없어요.');
  const client = clientFor(account, mailPasswordFor(officeId));
  client.on('error', () => {});
  const seen = new Set(loadKv<string[]>(seenKey(officeId, account)) ?? []);
  const mails: (Mail & { uid: number })[] = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      const validity = String(client.mailbox ? client.mailbox.uidValidity : '');
      const since = new Date(Date.now() - RECENT_DAYS * 86_400_000);
      const uids = (await client.search({ since }, { uid: true })) || [];
      // Newest first; a message is known by its mailbox validity and UID, which never point at another message.
      const fresh = uids
        .slice()
        .reverse()
        .filter((uid) => !seen.has(`${validity}:${uid}`))
        .slice(0, MAX_NEW);
      for (const uid of fresh) {
        const message = await client.fetchOne(String(uid), { uid: true, envelope: true, internalDate: true, source: { maxLength: MAX_SOURCE } }, { uid: true });
        seen.add(`${validity}:${uid}`);
        if (!message || !message.source) continue;
        const parsed = await simpleParser(message.source);
        const from = parsed.from?.value[0];
        const received = parsed.date ?? (message.internalDate ? new Date(message.internalDate) : new Date());
        mails.push({
          id: `imap_${createHash('sha256').update(`${account.user}:${validity}:${uid}`).digest('hex').slice(0, 16)}`,
          from: from ? (from.name ? `${from.name} <${from.address}>` : (from.address ?? '')) : '',
          subject: parsed.subject || '(제목 없음)',
          body: (parsed.text ?? '').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_BODY),
          receivedAt: received.toISOString(),
          processed: false,
          source: 'imap',
          remote: { uid, uidValidity: validity },
          uid,
        });
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (error) {
    client.close();
    throw new Error(explain(error, account));
  } finally {
    saveKv(seenKey(officeId, account), [...seen].slice(-MAX_SEEN));
  }
  if (!mails.length) return 0;
  // Newest on top of the mailbox; messages from the same moment by their order in the inbox.
  const sorted = mails.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || b.uid - a.uid).map(({ uid: _uid, ...mail }) => mail);
  store.mutate((s) => {
    s.mailbox = [...sorted, ...s.mailbox].slice(0, 100);
  });
  const researcher = store.agentByRole(officeId, 'researcher');
  for (const mail of sorted) store.emit('mail.received', { agentId: researcher.id, payload: { subject: mail.subject } });
  return mails.length;
}
