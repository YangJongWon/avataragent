import type { Account } from './auth.ts';
import { Community, CommunityError } from './community.ts';
import type { Db } from './db.ts';

/** Creator pages, the ranking and badges. Everything is worked out from items, likes, downloads and answers. */

export const HANDLE = /^[a-z0-9][a-z0-9_-]{1,23}$/;
const RESERVED = new Set(['admin', 'administrator', 'api', 'root', 'support', 'help', 'system', 'official', 'me', 'new', 'edit']);
const DAY_MS = 86_400_000;
export const PERIODS = { week: 7, month: 30, all: null } as const;
export type Period = keyof typeof PERIODS;
/** Likes count three times a download: one person can download many times, but like once. */
export const LIKE_WEIGHT = 3;
const POPULAR_DOWNLOADS = 100;
const HELPER_ANSWERS = 3;
const TOP = 10;

export interface Badge {
  id: 'first-upload' | 'verified' | 'popular' | 'top10' | 'helper';
  icon: string;
  label: string;
}

const BADGES: Record<Badge['id'], Omit<Badge, 'id'>> = {
  'first-upload': { icon: '🌱', label: '첫 업로드' },
  verified: { icon: '✅', label: '검수 통과' },
  popular: { icon: '🔥', label: `다운로드 ${POPULAR_DOWNLOADS}회` },
  top10: { icon: '🏆', label: '이달의 TOP 10' },
  helper: { icon: '💡', label: `채택된 답변 ${HELPER_ANSWERS}개` },
};

export interface RankRow {
  handle: string;
  name: string;
  avatarUrl: string;
  score: number;
  downloads: number;
  likes: number;
  items: number;
}

const isPeriod = (v: unknown): v is Period => typeof v === 'string' && v in PERIODS;

function cleanLinks(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const links: string[] = [];
  for (const value of list.slice(0, 3)) {
    const text = String(value ?? '').trim();
    if (!text) continue;
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      throw new CommunityError(`링크 주소를 확인해 주세요: ${text.slice(0, 60)}`);
    }
    if (url.protocol !== 'https:' || text.length > 200) throw new CommunityError('링크는 https:// 로 시작하는 200자 이내 주소만 넣을 수 있어요.');
    links.push(url.toString());
  }
  return links;
}

export class Creators {
  private db: Db;
  private community: Community;
  private now: () => Date;

  constructor(db: Db, community: Community, now: () => Date = () => new Date()) {
    this.db = db;
    this.community = community;
    this.now = now;
  }

  async ranking(period: unknown = 'month', limit = 50): Promise<RankRow[]> {
    const days = PERIODS[isPeriod(period) ? period : 'month'];
    const since = days === null ? new Date(0) : new Date(this.now().getTime() - days * DAY_MS);
    return this.db.query<RankRow>(
      `WITH d AS (
         SELECT i.owner_id, sum(dl.count)::int AS downloads FROM item_downloads dl JOIN items i ON i.id = dl.item_id
         WHERE i.status = 'published' AND dl.day >= $1::date GROUP BY i.owner_id),
       l AS (
         SELECT i.owner_id, count(*)::int AS likes FROM item_likes k JOIN items i ON i.id = k.item_id
         WHERE i.status = 'published' AND k.created_at >= $2 GROUP BY i.owner_id),
       n AS (SELECT owner_id, count(*)::int AS items FROM items WHERE status = 'published' GROUP BY owner_id),
       r AS (
         SELECT p.handle, a.name, a.avatar_url AS "avatarUrl", COALESCE(d.downloads, 0) AS downloads, COALESCE(l.likes, 0) AS likes, n.items,
                COALESCE(d.downloads, 0) + ${LIKE_WEIGHT} * COALESCE(l.likes, 0) AS score
         FROM n JOIN accounts a ON a.id = n.owner_id JOIN profiles p ON p.account_id = a.id
         LEFT JOIN d ON d.owner_id = a.id LEFT JOIN l ON l.owner_id = a.id
         WHERE a.status = 'active')
       SELECT * FROM r WHERE score > 0 ORDER BY score DESC, items DESC, handle LIMIT ${Math.min(100, Math.max(1, limit))}`,
      [since.toISOString().slice(0, 10), since],
    );
  }

  async badges(accountId: string, handle: string): Promise<Badge[]> {
    const [stats] = await this.db.query<{ items: number; verified: number; downloads: number; answers: number }>(
      `SELECT
         (SELECT count(*)::int FROM items WHERE owner_id = $1 AND status = 'published') AS items,
         (SELECT count(*)::int FROM items WHERE owner_id = $1 AND status = 'published' AND verified) AS verified,
         (SELECT COALESCE(sum(downloads), 0)::int FROM items WHERE owner_id = $1 AND status = 'published') AS downloads,
         (SELECT count(*)::int FROM posts p JOIN comments c ON c.id = p.accepted_comment_id
            WHERE c.author_id = $1 AND c.status = 'published' AND p.status = 'published') AS answers`,
      [accountId],
    );
    const top = (await this.ranking('month', TOP)).some((r) => r.handle === handle);
    const earned: Badge['id'][] = [];
    if (stats.items > 0) earned.push('first-upload');
    if (stats.verified > 0) earned.push('verified');
    if (stats.downloads >= POPULAR_DOWNLOADS) earned.push('popular');
    if (top) earned.push('top10');
    if (stats.answers >= HELPER_ANSWERS) earned.push('helper');
    return earned.map((id) => ({ id, ...BADGES[id] }));
  }

  async profile(handle: string, viewer: Account | null) {
    const [row] = await this.db.query<{ id: string; name: string; avatar_url: string; status: string; bio: string; links: string[]; handle: string; created_at: Date }>(
      'SELECT a.id, a.name, a.avatar_url, a.status, a.created_at, p.bio, p.links, p.handle FROM profiles p JOIN accounts a ON a.id = p.account_id WHERE p.handle = $1',
      [String(handle).toLowerCase()],
    );
    const admin = viewer?.role === 'admin';
    if (!row || (row.status !== 'active' && !admin)) throw new CommunityError('없는 사용자예요.', 404);
    const items = await this.community.list({ owner: row.handle, sort: 'new', limit: 48 });
    const [totals] = await this.db.query<{ downloads: number; likes: number; posts: number }>(
      `SELECT
         (SELECT COALESCE(sum(downloads), 0)::int FROM items WHERE owner_id = $1 AND status = 'published') AS downloads,
         (SELECT COALESCE(sum(likes), 0)::int FROM items WHERE owner_id = $1 AND status = 'published') AS likes,
         (SELECT count(*)::int FROM posts WHERE author_id = $1 AND status = 'published') AS posts`,
      [row.id],
    );
    const rank = (await this.ranking('month', 100)).findIndex((r) => r.handle === row.handle);
    return {
      handle: row.handle,
      name: row.name,
      avatarUrl: row.avatar_url,
      bio: row.bio,
      links: row.links,
      joinedAt: new Date(row.created_at).toISOString(),
      suspended: row.status !== 'active',
      mine: viewer?.id === row.id,
      badges: await this.badges(row.id, row.handle),
      totals: { items: items.total, ...totals },
      monthRank: rank >= 0 ? rank + 1 : null,
      items: items.items,
    };
  }

  async update(account: Account, input: { handle?: unknown; name?: unknown; bio?: unknown; links?: unknown }) {
    const [current] = await this.db.query<{ handle: string }>('SELECT handle FROM profiles WHERE account_id = $1', [account.id]);
    const handle = input.handle === undefined ? current.handle : String(input.handle).trim().toLowerCase();
    if (!HANDLE.test(handle)) throw new CommunityError('아이디는 영어 소문자·숫자·_·-로 2~24자여야 해요.');
    if (handle !== current.handle && RESERVED.has(handle)) throw new CommunityError('쓸 수 없는 아이디예요.');
    if (handle !== current.handle) {
      const taken = await this.db.query('SELECT 1 FROM profiles WHERE handle = $1', [handle]);
      if (taken.length) throw new CommunityError('이미 다른 사람이 쓰는 아이디예요.', 409);
    }
    const name = input.name === undefined ? account.name : String(input.name).trim().slice(0, 40);
    const bio = input.bio === undefined ? null : String(input.bio).trim().slice(0, 300);
    const links = input.links === undefined ? null : cleanLinks(input.links);
    await this.db.transaction(async (tx) => {
      await tx.query('UPDATE accounts SET name = $2 WHERE id = $1', [account.id, name]);
      await tx.query(
        'UPDATE profiles SET handle = $2, bio = COALESCE($3, bio), links = COALESCE($4::jsonb, links) WHERE account_id = $1',
        [account.id, handle, bio, links === null ? null : JSON.stringify(links)],
      );
    });
    return this.profile(handle, account);
  }

  async handleOf(accountId: string) {
    const [row] = await this.db.query<{ handle: string }>('SELECT handle FROM profiles WHERE account_id = $1', [accountId]);
    return row?.handle ?? null;
  }
}
