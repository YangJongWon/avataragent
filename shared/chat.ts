import { canSeeOffice } from './access.ts';
import { planHas, type Plan } from './plans.ts';
import type { ChatMessage, ForwardMode, Task, Viewer } from './types.ts';

export const MAX_CHAT_MESSAGES = 300;
export const MAX_CHAT_CHARS = 1000;
export const MAX_CHAT_NOTES = 20;
export const COMPANY_CHANNEL = 'company';

export const officeChannel = (officeId: string) => `office:${officeId}`;
export const taskChannel = (taskId: string) => `task:${taskId}`;

export function parseChannel(channel: string): { kind: 'company' } | { kind: 'office'; id: string } | { kind: 'task'; id: string } | null {
  if (channel === COMPANY_CHANNEL) return { kind: 'company' };
  const [kind, id] = channel.split(':');
  if ((kind === 'office' || kind === 'task') && id) return { kind, id };
  return null;
}

/** The task a message talks about: its card, or the task thread it was written in. */
export function taskOfMessage(message: ChatMessage) {
  if (message.taskId) return message.taskId;
  const parsed = parseChannel(message.channel);
  return parsed?.kind === 'task' ? parsed.id : null;
}

export const FORWARD_LABEL: Record<ForwardMode, string> = { note: '참고 메모로 전달', answer: '도움 요청 답변으로 전달', changes: '수정 요청으로 전달' };
export const FORWARDED_AS: Record<ForwardMode, string> = { note: '참고 메모로', answer: '도움 요청 답변으로', changes: '수정 요청으로' };

/** How a person's message can reach the task's AI staff right now; empty once the task is over or the message was handed over. */
export function forwardModes(message: ChatMessage, task: Task | undefined): ForwardMode[] {
  if (!task || message.forwarded || message.author.kind === 'system' || !message.text.trim()) return [];
  const modes: ForwardMode[] = [];
  if (task.status === 'awaiting_help' && task.help) modes.push('answer');
  if (task.status === 'awaiting_approval') modes.push('changes');
  if (task.status === 'queued' || task.status === 'running' || task.status === 'awaiting_help') modes.push('note');
  return modes;
}

/**
 * Chat belongs to people with an identity: the owner and member accounts. Share links never see it.
 * `officeOfTask` returns null for tasks that no longer exist.
 */
export function canUseChannel(viewer: Viewer, plan: Plan, channel: string, officeOfTask: (taskId: string) => string | null) {
  if (!planHas(plan, 'chat') || viewer.kind === 'share') return false;
  const parsed = parseChannel(channel);
  if (!parsed) return false;
  if (parsed.kind === 'office' && !planHas(plan, 'officeChannels')) return false;
  if (viewer.kind === 'owner') return true;
  if (parsed.kind === 'company') return true;
  const officeId = parsed.kind === 'office' ? parsed.id : officeOfTask(parsed.id);
  return officeId !== null && canSeeOffice(viewer, officeId);
}

/** A task card is only shown to people who can see that task's office. */
export function canReadMessage(viewer: Viewer, plan: Plan, message: ChatMessage, officeOfTask: (taskId: string) => string | null) {
  if (!canUseChannel(viewer, plan, message.channel, officeOfTask)) return false;
  if (!message.taskId || viewer.kind === 'owner') return true;
  const officeId = officeOfTask(message.taskId);
  return officeId !== null && canSeeOffice(viewer, officeId);
}
