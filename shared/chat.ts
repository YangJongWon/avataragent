import { canSeeOffice } from './access.ts';
import { planHas, type Plan } from './plans.ts';
import type { ChatMessage, Viewer } from './types.ts';

export const MAX_CHAT_MESSAGES = 300;
export const MAX_CHAT_CHARS = 1000;
export const COMPANY_CHANNEL = 'company';

export const officeChannel = (officeId: string) => `office:${officeId}`;
export const taskChannel = (taskId: string) => `task:${taskId}`;

export function parseChannel(channel: string): { kind: 'company' } | { kind: 'office'; id: string } | { kind: 'task'; id: string } | null {
  if (channel === COMPANY_CHANNEL) return { kind: 'company' };
  const [kind, id] = channel.split(':');
  if ((kind === 'office' || kind === 'task') && id) return { kind, id };
  return null;
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
