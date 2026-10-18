/**
 * What approving the HR mail report does in the real mailbox. Mail a person still has to handle stays in the inbox
 * with a label; mail that is read and done is labelled and archived. Nothing is deleted or marked read, and every
 * label or folder sits under one parent so it never mixes with the owner's own.
 */
export type MailKind = 'event' | 'request' | 'info' | 'ad';

export const SORT_ROOT = 'AvatarCast';

export const MAIL_SORT: Record<MailKind, { label: string; archive: boolean }> = {
  event: { label: '일정', archive: false },
  request: { label: '회신 필요', archive: false },
  info: { label: '정보', archive: true },
  ad: { label: '광고', archive: true },
};

const KINDS: MailKind[] = ['event', 'request', 'info', 'ad'];

/**
 * The kind of a sorted mail: the code the report gives, or else its category in whatever language the report was
 * written in.
 */
export function mailKindOf(item: { kind?: unknown; category?: unknown }): MailKind | null {
  if (typeof item.kind === 'string' && KINDS.includes(item.kind as MailKind)) return item.kind as MailKind;
  const category = String(item.category ?? '');
  if (/일정|予定|日程|schedule|event|calendar/i.test(category)) return 'event';
  if (/요청|회신|依頼|返信|请求|回复|request|reply/i.test(category)) return 'request';
  if (/광고|広告|广告|promo|advert|marketing|newsletter|\bads?\b/i.test(category)) return 'ad';
  if (/정보|情報|信息|info/i.test(category)) return 'info';
  return null;
}
