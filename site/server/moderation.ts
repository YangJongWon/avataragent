import type { Account } from './auth.ts';
import { CommunityError } from './community.ts';
import type { Db } from './db.ts';
import type { Forum } from './forum.ts';

/**
 * What admins see and do: the queue of reported or hidden things, suspending accounts, and a log of every
 * admin action.
 */

export type TargetType = 'item' | 'post' | 'comment';

interface Report {
  reason: string;
  at: string;
  by: string | null;
}

export interface QueueEntry {
  type: TargetType;
  id: string;
  /** For comments, the post they are on. */
  postId?: string;
  title: string;
  status: string;
  hiddenReason: string | null;
  author: { handle: string | null; email: string };
  reports: Report[];
}

const TABLE: Record<TargetType, string> = { item: 'items', post: 'posts', comment: 'comments' };

export function requireAdmin(account: Account) {
  if (account.role !== 'admin') throw new CommunityError('운영자만 할 수 있어요.', 403);
}

export async function audit(db: Pick<Db, 'query'>, actor: Account, action: string, target: string, detail: Record<string, unknown> = {}) {
  await db.query('INSERT INTO audit_log (actor_id, action, target, detail) VALUES ($1, $2, $3, $4::jsonb)', [actor.id, action, target, JSON.stringify(detail)]);
}

export class Moderation {
  private db: Db;
  private forum: Forum;
  private now: () => Date;

  constructor(db: Db, forum: Forum, now: () => Date = () => new Date()) {
    this.db = db;
    this.forum = forum;
    this.now = now;
  }

  /** Everything with open reports or hidden by reports, most reported first. */
  async queue(admin: Account): Promise<QueueEntry[]> {
    requireAdmin(admin);
    const rows = await this.db.query<{
      type: TargetType;
      id: string;
      post_id: string | null;
      title: string;
      status: string;
      hidden_reason: string | null;
      handle: string | null;
      email: string;
      reports: Report[] | null;
    }>(
      `WITH open AS (
         SELECT 'item' AS type, item_id AS id, reason, created_at, account_id FROM item_reports WHERE resolved_at IS NULL
         UNION ALL
         SELECT target_type, target_id, reason, created_at, account_id FROM forum_reports WHERE resolved_at IS NULL),
       grouped AS (
         SELECT o.type, o.id, json_agg(json_build_object('reason', o.reason, 'at', o.created_at, 'by', p.handle) ORDER BY o.created_at) AS reports
         FROM open o LEFT JOIN profiles p ON p.account_id = o.account_id GROUP BY o.type, o.id),
       targets AS (
         SELECT 'item' AS type, id, NULL::text AS post_id, title, status, hidden_reason, owner_id AS author FROM items
         UNION ALL SELECT 'post', id, NULL, title, status, hidden_reason, author_id FROM posts
         UNION ALL SELECT 'comment', c.id, c.post_id, left(c.body, 120), c.status, c.hidden_reason, c.author_id FROM comments c)
       SELECT t.type, t.id, t.post_id, t.title, t.status, t.hidden_reason, p.handle, a.email, g.reports
       FROM targets t
       JOIN accounts a ON a.id = t.author LEFT JOIN profiles p ON p.account_id = t.author
       LEFT JOIN grouped g ON g.type = t.type AND g.id = t.id
       WHERE g.reports IS NOT NULL OR t.hidden_reason = 'reports'
       ORDER BY json_array_length(COALESCE(g.reports, '[]'::json)) DESC, t.id`,
    );
    return rows.map((r) => ({
      type: r.type,
      id: r.id,
      ...(r.post_id ? { postId: r.post_id } : {}),
      title: r.title,
      status: r.status,
      hiddenReason: r.hidden_reason,
      author: { handle: r.handle, email: r.email },
      reports: (r.reports ?? []).map((x) => ({ ...x, at: new Date(x.at).toISOString() })),
    }));
  }

  /** restore: show it again and close its reports. remove: take it down for good and close its reports. */
  async resolve(admin: Account, type: unknown, id: string, action: unknown) {
    requireAdmin(admin);
    if (type !== 'item' && type !== 'post' && type !== 'comment') throw new CommunityError('없는 대상이에요.');
    if (action !== 'restore' && action !== 'remove') throw new CommunityError('없는 동작이에요.');
    const [target] = await this.db.query<{ status: string }>(`SELECT status FROM ${TABLE[type]} WHERE id = $1`, [id]);
    if (!target) throw new CommunityError('없는 대상이에요.', 404);
    const status = action === 'restore' ? 'published' : 'removed';
    if (type === 'comment') await this.forum.setCommentStatus(id, status);
    else await this.db.query(`UPDATE ${TABLE[type]} SET status = $2, hidden_reason = NULL WHERE id = $1`, [id, status]);
    const now = this.now();
    if (type === 'item') await this.db.query('UPDATE item_reports SET resolved_at = $2 WHERE item_id = $1 AND resolved_at IS NULL', [id, now]);
    else await this.db.query('UPDATE forum_reports SET resolved_at = $3 WHERE target_type = $1 AND target_id = $2 AND resolved_at IS NULL', [type, id, now]);
    await audit(this.db, admin, `${type}.${action}`, id, { from: target.status });
    return { ok: true };
  }

  async users(admin: Account, q: unknown) {
    requireAdmin(admin);
    const text = typeof q === 'string' ? q.trim().toLowerCase().slice(0, 60) : '';
    const rows = await this.db.query<{ id: string; email: string; name: string; role: string; status: string; handle: string | null; created_at: Date; items: number; posts: number }>(
      `SELECT a.id, a.email, a.name, a.role, a.status, a.created_at, p.handle,
              (SELECT count(*)::int FROM items WHERE owner_id = a.id AND status <> 'removed') AS items,
              (SELECT count(*)::int FROM posts WHERE author_id = a.id AND status <> 'removed') AS posts
       FROM accounts a LEFT JOIN profiles p ON p.account_id = a.id
       WHERE $1 = '' OR a.email LIKE $2 OR p.handle LIKE $2
       ORDER BY a.created_at DESC LIMIT 50`,
      [text, `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`],
    );
    return rows.map((r) => ({ ...r, created_at: undefined, createdAt: new Date(r.created_at).toISOString() }));
  }

  /** Suspending signs the person out everywhere; their items and posts stay until handled one by one. */
  async suspend(admin: Account, accountId: string, on: boolean, reason: unknown) {
    requireAdmin(admin);
    if (accountId === admin.id) throw new CommunityError('나 자신은 정지할 수 없어요.');
    const [target] = await this.db.query<{ role: string; status: string }>('SELECT role, status FROM accounts WHERE id = $1', [accountId]);
    if (!target) throw new CommunityError('없는 계정이에요.', 404);
    if (target.role === 'admin') throw new CommunityError('운영자는 정지할 수 없어요.', 403);
    const why = typeof reason === 'string' ? reason.trim().slice(0, 300) : '';
    if (on && !why) throw new CommunityError('정지 이유를 적어 주세요.');
    await this.db.transaction(async (tx) => {
      await tx.query('UPDATE accounts SET status = $2 WHERE id = $1', [accountId, on ? 'suspended' : 'active']);
      if (on) await tx.query('DELETE FROM sessions WHERE account_id = $1', [accountId]);
      await audit(tx, admin, on ? 'account.suspend' : 'account.unsuspend', accountId, why ? { reason: why } : {});
    });
    return { ok: true };
  }

  async log(admin: Account) {
    requireAdmin(admin);
    const rows = await this.db.query<{ id: string; action: string; target: string; detail: Record<string, unknown>; created_at: Date; actor: string | null }>(
      'SELECT l.id::text, l.action, l.target, l.detail, l.created_at, p.handle AS actor FROM audit_log l LEFT JOIN profiles p ON p.account_id = l.actor_id ORDER BY l.created_at DESC, l.id DESC LIMIT 100',
    );
    return rows.map((r) => ({ id: r.id, action: r.action, target: r.target, detail: r.detail, actor: r.actor, at: new Date(r.created_at).toISOString() }));
  }
}
