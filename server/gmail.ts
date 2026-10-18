import { isGmailServer, type McpServer } from '../shared/mcp.ts';
import type { Mail } from '../shared/types.ts';
import { loadKv, saveKv } from './db.ts';
import { callToolData } from './mcp.ts';
import { loginInfo } from './mcp-oauth.ts';
import { store } from './store.ts';

/**
 * The HR office's mailbox can read a real Gmail inbox through Google's Gmail MCP server (search_threads, get_thread).
 * New messages land in the same mailbox the simulation fills, so sorting, summaries and calendar entries work as before.
 */
const QUERY = 'in:inbox newer_than:2d';
/** One import reads at most this many new messages: each one is a get_thread call and part of the next task's prompt. */
const MAX_NEW = 10;
const MAX_BODY = 3000;
const MAX_SEEN = 1000;

interface GmailMessage {
  id?: string;
  subject?: string;
  sender?: string;
  date?: string;
  snippet?: string;
  plaintextBody?: string;
  labelIds?: string[];
}
interface GmailThread {
  id?: string;
  messages?: GmailMessage[];
}

/** The Gmail connections the owner made in MCP 관리. */
export const gmailServers = (): McpServer[] => store.data.mcpServers.filter(isGmailServer);

const seenKey = (serverId: string) => `gmail_seen_${serverId}`;

/** Reads new inbox messages into the HR mailbox; returns how many arrived. */
export async function importGmail(officeId: string): Promise<number> {
  const office = store.office(officeId);
  if (office.team !== 'hr') throw new Error('Gmail은 인사팀 메일함에만 연결할 수 있어요.');
  const server = store.data.mcpServers.find((s) => s.id === office.gmailServerId);
  if (!server) throw new Error('연결할 Gmail MCP를 먼저 골라 주세요.');
  if (!server.enabled) throw new Error(`${server.name} 연결이 꺼져 있어요. MCP 관리에서 켜 주세요.`);
  if (server.oauth && !loginInfo(server.id).loggedIn) throw new Error(`${server.name}에 아직 로그인하지 않았어요. MCP 관리에서 로그인해 주세요.`);

  const found = (await callToolData(server, 'search_threads', { query: QUERY, pageSize: 20 })) as { threads?: GmailThread[] };
  const seen = new Set(loadKv<string[]>(seenKey(server.id)) ?? []);
  const fresh: { threadId: string; message: GmailMessage }[] = [];
  for (const thread of found.threads ?? []) {
    // A thread's newest message is the one to sort; earlier ones were read in an earlier import or are context.
    const message = thread.messages?.at(-1);
    if (!thread.id || !message?.id || seen.has(message.id)) continue;
    if (message.labelIds?.some((l) => l === 'SENT' || l === 'DRAFT')) continue;
    fresh.push({ threadId: thread.id, message });
    if (fresh.length >= MAX_NEW) break;
  }

  const mails: Mail[] = [];
  for (const { threadId, message } of fresh) {
    let body = message.snippet ?? '';
    try {
      const thread = (await callToolData(server, 'get_thread', { threadId, messageFormat: 'FULL_CONTENT' })) as GmailThread;
      const full = thread.messages?.find((m) => m.id === message.id) ?? thread.messages?.at(-1);
      body = full?.plaintextBody?.trim() || body;
    } catch {
      // The snippet still lets the team sort it.
    }
    mails.push({
      id: `gmail_${message.id}`,
      from: message.sender ?? '',
      subject: message.subject || '(제목 없음)',
      body: body.replace(/\s+\n/g, '\n').slice(0, MAX_BODY),
      receivedAt: message.date ? `${message.date}T00:00:00` : new Date().toISOString(),
      processed: false,
      source: 'gmail',
    });
    seen.add(message.id!);
  }
  saveKv(seenKey(server.id), [...seen].slice(-MAX_SEEN));
  if (!mails.length) return 0;

  store.mutate((s) => {
    s.mailbox = [...mails, ...s.mailbox].slice(0, 100);
  });
  const researcher = store.agentByRole(officeId, 'researcher');
  for (const mail of mails) store.emit('mail.received', { agentId: researcher.id, payload: { subject: mail.subject } });
  return mails.length;
}
