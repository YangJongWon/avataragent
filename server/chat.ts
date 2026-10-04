import { randomUUID } from 'node:crypto';
import { canUseChannel, COMPANY_CHANNEL, MAX_CHAT_CHARS, MAX_CHAT_MESSAGES, officeChannel } from '../shared/chat.ts';
import { planHas } from '../shared/plans.ts';
import type { ChatMessage, OfficeEvent, Viewer } from '../shared/types.ts';
import { ForbiddenError } from './access.ts';
import { store } from './store.ts';

const officeOfTask = (taskId: string) => store.data.tasks.find((t) => t.id === taskId)?.officeId ?? null;

function add(message: Omit<ChatMessage, 'id' | 'at'>) {
  const full: ChatMessage = { ...message, id: `chat_${randomUUID().slice(0, 8)}`, at: new Date().toISOString() };
  store.mutate((s) => {
    s.chat.push(full);
    s.chat = s.chat.slice(-MAX_CHAT_MESSAGES);
  });
  return full;
}

const authorOf = (viewer: Viewer): ChatMessage['author'] =>
  viewer.kind === 'member' ? { kind: 'member', id: viewer.memberId, name: viewer.name } : { kind: 'owner', id: 'owner', name: '소유자' };

export function postChat(viewer: Viewer, body: Record<string, unknown>) {
  const channel = String(body.channel ?? '');
  const text = String(body.text ?? '').trim().slice(0, MAX_CHAT_CHARS);
  const taskId = typeof body.taskId === 'string' && body.taskId ? body.taskId : undefined;
  if (!canUseChannel(viewer, store.data.plan, channel, officeOfTask)) throw new ForbiddenError('이 채널에 글을 쓸 수 없어요.');
  if (taskId) {
    const officeId = officeOfTask(taskId);
    if (!officeId || (viewer.kind !== 'owner' && !canUseChannel(viewer, store.data.plan, `task:${taskId}`, officeOfTask))) {
      throw new ForbiddenError('공유할 수 없는 업무예요.');
    }
  }
  if (!text && !taskId) throw new Error('메시지를 입력해 주세요.');
  return add({ channel, author: authorOf(viewer), text, taskId });
}

/** Where office news goes: its own channel on business, the company channel on team. */
const newsChannel = (officeId: string) => (planHas(store.data.plan, 'officeChannels') ? officeChannel(officeId) : COMPANY_CHANNEL);

const NEWS: Record<string, (event: OfficeEvent) => string> = {
  'agent.help_requested': (e) => `🙋 직원이 도움을 요청했어요: ${String(e.payload.question ?? '')}`,
  'approval.requested': () => '📝 결과물이 올라와 승인을 기다리고 있어요.',
  'task.completed': () => '🎉 업무가 끝났어요.',
  'task.failed': (e) => `⚠ 업무가 중단됐어요: ${String(e.payload.reason ?? '')}`,
};

/** Posts the AI staff's important moments into chat so people can talk about them right there. */
export function chatNews(event: OfficeEvent) {
  const make = NEWS[event.type];
  if (!make || !event.taskId || !planHas(store.data.plan, 'chat')) return;
  const officeId = officeOfTask(event.taskId);
  if (!officeId) return;
  const office = store.data.offices.find((o) => o.id === officeId);
  add({ channel: newsChannel(officeId), author: { kind: 'system', id: 'system', name: `🤖 ${office?.name ?? '사무실'}` }, text: make(event), taskId: event.taskId });
}
