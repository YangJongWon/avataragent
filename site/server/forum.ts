import { randomBytes } from 'node:crypto';
import type { Account } from './auth.ts';
import { CommunityError } from './community.ts';
import type { Db } from './db.ts';

/**
 * The forum: notices, questions with a chosen answer, tips, ideas and showcases. Bodies are Markdown, stored as
 * written and sanitized where they are shown (DOMPurify in the page).
 */

export const CATEGORIES = {
  notice: { icon: '📢', label: '공지' },
  question: { icon: '❓', label: '질문' },
  tip: { icon: '💡', label: '팁' },
  idea: { icon: '🛠️', label: '기능 제안' },
  showcase: { icon: '🏢', label: '내 사무실 자랑' },
} as const;
export type Category = keyof typeof CATEGORIES;

export const FORUM_LIMITS = { title: 100, body: 20_000, comment: 5_000, postsPerDay: 10, commentsPerDay: 60 };
export const REPORTS_TO_HIDE = 3;
const DAY_MS = 86_400_000;
const PAGE = 30;

const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString('base64url')}`;
const isCategory = (v: unknown): v is Category => typeof v === 'string' && v in CATEGORIES;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

interface PostRow {
  id: string;
  category: Category;
  author_id: string;
  title: string;
  body: string;
  status: 'published' | 'hidden' | 'removed';
  hidden_reason: string | null;
  pinned: boolean;
  accepted_comment_id: string | null;
  comment_count: number;
  created_at: Date;
  edited_at: Date | null;
  last_activity_at: Date;
  author_handle: string | null;
  author_name: string;
  author_avatar: string;
}

interface CommentRow {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  status: 'published' | 'hidden' | 'removed';
  hidden_reason: string | null;
  created_at: Date;
  edited_at: Date | null;
  author_handle: string | null;
  author_name: string;
  author_avatar: string;
}

const AUTHOR = `p.handle AS author_handle, a.name AS author_name, a.avatar_url AS author_avatar`;
const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
const author = (r: { author_handle: string | null; author_name: string; author_avatar: string }) => ({ handle: r.author_handle, name: r.author_name, avatarUrl: r.author_avatar });

function text(value: unknown, max: number, what: string, min = 1) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (s.length < min) throw new CommunityError(`${what}을(를) 적어 주세요.`);
  if (s.length > max) throw new CommunityError(`${what}은(는) ${max.toLocaleString()}자까지예요.`);
  return s;
}

export class Forum {
  private db: Db;
  private now: () => Date;

  constructor(db: Db, now: () => Date = () => new Date()) {
    this.db = db;
    this.now = now;
  }

  private async post(id: string) {
    return (
      (
        await this.db.query<PostRow>(
          `SELECT po.*, ${AUTHOR} FROM posts po JOIN accounts a ON a.id = po.author_id LEFT JOIN profiles p ON p.account_id = po.author_id WHERE po.id = $1`,
          [id],
        )
      )[0] ?? null
    );
  }

  private canSee(row: { status: string; author_id: string }, viewer: Account | null) {
    if (row.status === 'published') return true;
    return row.status === 'hidden' && !!viewer && (viewer.id === row.author_id || viewer.role === 'admin');
  }

  private async recent(table: 'posts' | 'comments', accountId: string) {
    const [{ n }] = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE author_id = $1 AND created_at > $2`, [
      accountId,
      new Date(this.now().getTime() - DAY_MS),
    ]);
    return n;
  }

  private active(account: Account) {
    if (account.status !== 'active') throw new CommunityError('글쓰기가 막힌 계정이에요.', 403);
  }

  async list(query: { category?: unknown; q?: unknown; author?: unknown; offset?: unknown }) {
    const where = ["po.status = 'published'"];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      where.push(sql.replaceAll('?', `$${params.length}`));
    };
    if (isCategory(query.category)) add('po.category = ?', query.category);
    const q = typeof query.q === 'string' ? query.q.trim().slice(0, 60) : '';
    if (q) add("(po.title ILIKE ? ESCAPE '\\' OR po.body ILIKE ? ESCAPE '\\')", `%${escapeLike(q)}%`);
    if (typeof query.author === 'string' && query.author) add('p.handle = ?', query.author);
    const offset = Math.max(0, Number(query.offset) || 0);
    const rows = await this.db.query<PostRow & { total: number }>(
      `SELECT po.*, ${AUTHOR}, count(*) OVER ()::int AS total
       FROM posts po JOIN accounts a ON a.id = po.author_id LEFT JOIN profiles p ON p.account_id = po.author_id
       WHERE ${where.join(' AND ')}
       ORDER BY po.pinned DESC, po.last_activity_at DESC LIMIT ${PAGE} OFFSET ${offset}`,
      params,
    );
    return {
      total: rows[0]?.total ?? 0,
      posts: rows.map((r) => ({
        id: r.id,
        category: r.category,
        title: r.title,
        excerpt: r.body.replace(/[#*_`>\[\]()!-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 140),
        pinned: r.pinned,
        answered: r.accepted_comment_id !== null,
        comments: r.comment_count,
        author: author(r),
        createdAt: iso(r.created_at),
        lastActivityAt: iso(r.last_activity_at),
      })),
    };
  }

  async get(id: string, viewer: Account | null) {
    const row = await this.post(id);
    if (!row || !this.canSee(row, viewer)) throw new CommunityError('없는 글이에요.', 404);
    const admin = viewer?.role === 'admin';
    const comments = await this.db.query<CommentRow>(
      `SELECT c.*, ${AUTHOR} FROM comments c JOIN accounts a ON a.id = c.author_id LEFT JOIN profiles p ON p.account_id = c.author_id
       WHERE c.post_id = $1 AND c.status <> 'removed' ORDER BY c.created_at`,
      [id],
    );
    const mine = viewer?.id === row.author_id;
    return {
      id: row.id,
      category: row.category,
      title: row.title,
      body: row.body,
      status: row.status,
      hiddenReason: mine || admin ? row.hidden_reason : undefined,
      pinned: row.pinned,
      acceptedCommentId: row.accepted_comment_id,
      author: author(row),
      createdAt: iso(row.created_at),
      editedAt: iso(row.edited_at),
      mine,
      canEdit: mine || admin,
      canAccept: mine && row.category === 'question',
      comments: comments
        .filter((c) => this.canSee(c, viewer))
        .map((c) => ({
          id: c.id,
          body: c.body,
          status: c.status,
          author: author(c),
          createdAt: iso(c.created_at),
          editedAt: iso(c.edited_at),
          mine: viewer?.id === c.author_id,
          accepted: c.id === row.accepted_comment_id,
        })),
    };
  }

  async create(account: Account, input: { category?: unknown; title?: unknown; body?: unknown }) {
    this.active(account);
    if (!isCategory(input.category)) throw new CommunityError('게시판을 골라 주세요.');
    if (input.category === 'notice' && account.role !== 'admin') throw new CommunityError('공지는 운영자만 쓸 수 있어요.', 403);
    const title = text(input.title, FORUM_LIMITS.title, '제목', 2);
    const body = text(input.body, FORUM_LIMITS.body, '내용');
    if ((await this.recent('posts', account.id)) >= FORUM_LIMITS.postsPerDay) throw new CommunityError('오늘은 글을 더 쓸 수 없어요. 내일 다시 해 주세요.', 429);
    const id = newId('pst');
    const now = this.now();
    await this.db.query(
      'INSERT INTO posts (id, category, author_id, title, body, created_at, last_activity_at) VALUES ($1, $2, $3, $4, $5, $6, $6)',
      [id, input.category, account.id, title, body, now],
    );
    return { id };
  }

  async edit(account: Account, id: string, input: { title?: unknown; body?: unknown }) {
    const row = await this.post(id);
    if (!row || row.status === 'removed' || (row.author_id !== account.id && account.role !== 'admin')) throw new CommunityError('없는 글이에요.', 404);
    this.active(account);
    const title = text(input.title, FORUM_LIMITS.title, '제목', 2);
    const body = text(input.body, FORUM_LIMITS.body, '내용');
    await this.db.query('UPDATE posts SET title = $2, body = $3, edited_at = $4 WHERE id = $1', [id, title, body, this.now()]);
    return this.get(id, account);
  }

  /** The author takes a post down; admins remove through moderation. */
  async remove(account: Account, id: string) {
    const row = await this.post(id);
    if (!row || row.status === 'removed' || (row.author_id !== account.id && account.role !== 'admin')) throw new CommunityError('없는 글이에요.', 404);
    await this.db.query("UPDATE posts SET status = 'removed' WHERE id = $1", [id]);
    return { ok: true };
  }

  async comment(account: Account, postId: string, body: unknown) {
    this.active(account);
    const row = await this.post(postId);
    if (!row || row.status !== 'published') throw new CommunityError('없는 글이에요.', 404);
    const clean = text(body, FORUM_LIMITS.comment, '댓글');
    if ((await this.recent('comments', account.id)) >= FORUM_LIMITS.commentsPerDay) throw new CommunityError('오늘은 댓글을 더 쓸 수 없어요.', 429);
    const id = newId('cmt');
    const now = this.now();
    await this.db.transaction(async (tx) => {
      await tx.query('INSERT INTO comments (id, post_id, author_id, body, created_at) VALUES ($1, $2, $3, $4, $5)', [id, postId, account.id, clean, now]);
      await tx.query('UPDATE posts SET comment_count = comment_count + 1, last_activity_at = $2 WHERE id = $1', [postId, now]);
    });
    return { id };
  }

  async editComment(account: Account, id: string, body: unknown) {
    const [c] = await this.db.query<CommentRow>('SELECT * FROM comments WHERE id = $1', [id]);
    if (!c || c.status === 'removed' || c.author_id !== account.id) throw new CommunityError('없는 댓글이에요.', 404);
    this.active(account);
    await this.db.query('UPDATE comments SET body = $2, edited_at = $3 WHERE id = $1', [id, text(body, FORUM_LIMITS.comment, '댓글'), this.now()]);
    return { ok: true };
  }

  async removeComment(account: Account, id: string) {
    const [c] = await this.db.query<CommentRow>('SELECT * FROM comments WHERE id = $1', [id]);
    if (!c || c.status === 'removed' || (c.author_id !== account.id && account.role !== 'admin')) throw new CommunityError('없는 댓글이에요.', 404);
    await this.setCommentStatus(id, 'removed');
    return { ok: true };
  }

  /** Changes a comment's status, keeping the post's count and chosen answer in step. Used by moderation too. */
  async setCommentStatus(id: string, status: 'published' | 'hidden' | 'removed', reason: string | null = null) {
    await this.db.transaction(async (tx) => {
      const [c] = await tx.query<{ post_id: string; status: string }>('SELECT post_id, status FROM comments WHERE id = $1', [id]);
      if (!c || c.status === status) return;
      await tx.query('UPDATE comments SET status = $2, hidden_reason = $3 WHERE id = $1', [id, status, status === 'published' ? null : reason]);
      const delta = status === 'published' ? 1 : c.status === 'published' ? -1 : 0;
      if (delta) await tx.query('UPDATE posts SET comment_count = comment_count + $2 WHERE id = $1', [c.post_id, delta]);
      if (status === 'removed') await tx.query('UPDATE posts SET accepted_comment_id = NULL WHERE id = $1 AND accepted_comment_id = $2', [c.post_id, id]);
    });
  }

  /** The asker picks the answer that solved it (or clears the pick with null). */
  async accept(account: Account, postId: string, commentId: unknown) {
    const row = await this.post(postId);
    if (!row || row.status !== 'published') throw new CommunityError('없는 글이에요.', 404);
    if (row.author_id !== account.id || row.category !== 'question') throw new CommunityError('질문한 사람만 답변을 채택할 수 있어요.', 403);
    if (commentId === null) {
      await this.db.query('UPDATE posts SET accepted_comment_id = NULL WHERE id = $1', [postId]);
      return this.get(postId, account);
    }
    const [c] = await this.db.query<CommentRow>("SELECT * FROM comments WHERE id = $1 AND post_id = $2 AND status = 'published'", [String(commentId), postId]);
    if (!c) throw new CommunityError('없는 댓글이에요.', 404);
    if (c.author_id === account.id) throw new CommunityError('내 댓글은 채택할 수 없어요.');
    await this.db.query('UPDATE posts SET accepted_comment_id = $2 WHERE id = $1', [postId, c.id]);
    return this.get(postId, account);
  }

  async report(account: Account, type: unknown, id: string, reason: unknown) {
    if (type !== 'post' && type !== 'comment') throw new CommunityError('없는 대상이에요.');
    const why = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
    if (!why) throw new CommunityError('신고 이유를 적어 주세요.');
    const [target] = await this.db.query<{ author_id: string; status: string }>(`SELECT author_id, status FROM ${type === 'post' ? 'posts' : 'comments'} WHERE id = $1`, [id]);
    if (!target || target.status !== 'published') throw new CommunityError('없는 대상이에요.', 404);
    if (target.author_id === account.id) throw new CommunityError('내 글은 신고할 수 없어요.');
    await this.db.query(
      'INSERT INTO forum_reports (target_type, target_id, account_id, reason, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (target_type, target_id, account_id) DO UPDATE SET reason = EXCLUDED.reason',
      [type, id, account.id, why, this.now()],
    );
    const [{ n }] = await this.db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM forum_reports WHERE target_type = $1 AND target_id = $2 AND resolved_at IS NULL',
      [type, id],
    );
    if (n >= REPORTS_TO_HIDE) {
      if (type === 'post') await this.db.query("UPDATE posts SET status = 'hidden', hidden_reason = 'reports' WHERE id = $1", [id]);
      else await this.setCommentStatus(id, 'hidden', 'reports');
    }
    return { ok: true };
  }

  async pin(account: Account, id: string, pinned: boolean) {
    if (account.role !== 'admin') throw new CommunityError('운영자만 할 수 있어요.', 403);
    const changed = await this.db.query('UPDATE posts SET pinned = $2 WHERE id = $1 RETURNING 1', [id, pinned]);
    if (!changed.length) throw new CommunityError('없는 글이에요.', 404);
    return this.get(id, account);
  }
}
