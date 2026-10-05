import { createHash, randomBytes } from 'node:crypto';
import { zipSync } from 'fflate';
import { parseFlowPack } from '../../shared/flow-pack.ts';
import { parsePlaybook, rulesWarnings } from '../../shared/playbook.ts';
import { CONTENT_TYPES, extOf, readThemePackage } from '../../server/theme-package.ts';
import type { Account } from './auth.ts';
import type { Db } from './db.ts';
import type { FileStorage } from './storage.ts';

/**
 * The community gallery: people upload themes, flows and playbooks; each passes the same checks the app uses
 * before anything is stored, and what is stored is the cleaned result, so a download is what passed.
 */

export const ITEM_TYPES = ['theme', 'flow', 'playbook'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];
export type ItemStatus = 'published' | 'hidden' | 'removed';

export class CommunityError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Reports from this many different people hide an item until an admin looks at it. */
export const REPORTS_TO_HIDE = 3;
const UPLOADS_PER_DAY = 30;
const JSON_BYTES = 256 * 1024;
const DAY_MS = 86_400_000;
const TAG = /^[\p{L}\p{N}-]{1,20}$/u;

const newId = () => `itm_${randomBytes(9).toString('base64url')}`;
const isType = (v: unknown): v is ItemType => ITEM_TYPES.includes(v as ItemType);

export function parseTags(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  const tags = list.map((t) => String(t).trim().toLowerCase().replace(/^#/, '')).filter((t) => TAG.test(t));
  return [...new Set(tags)].slice(0, 5);
}

interface Checked {
  slug: string | null;
  title: string;
  summary: string;
  license: string;
  label: string | null;
  file: Uint8Array;
  preview: { bytes: Uint8Array; ext: string } | null;
  details: Record<string, unknown>;
  warnings: string[];
}

const readJson = (bytes: Uint8Array, what: string): unknown => {
  if (bytes.byteLength > JSON_BYTES) throw new CommunityError(`${what} 파일은 ${JSON_BYTES / 1024}KB까지예요.`);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new CommunityError(`${what} 파일을 JSON으로 읽을 수 없어요.`);
  }
};

const asCommunityError = (error: unknown) => (error instanceof CommunityError ? error : new CommunityError(error instanceof Error ? error.message : String(error)));

/** Runs an upload through the app's own checks for its type. */
export function checkUpload(type: ItemType, bytes: Uint8Array, license: string): Checked {
  try {
    if (type === 'theme') {
      const { manifest, files } = readThemePackage(bytes);
      const preview = files.get(manifest.preview)!;
      return {
        slug: manifest.id,
        title: manifest.name,
        summary: manifest.description,
        license: manifest.license,
        label: manifest.themeVersion,
        file: zipSync(Object.fromEntries(files)),
        preview: { bytes: preview, ext: extOf(manifest.preview) },
        details: {
          author: manifest.author,
          characters: manifest.characters.map((c) => ({ id: c.id, name: c.name })),
          hasCss: manifest.css !== null,
          variants: manifest.variants.length,
        },
        warnings: manifest.css ? ['직접 만든 CSS가 들어 있어요(앱에서 정리한 뒤 적용).'] : [],
      };
    }
    if (type === 'flow') {
      const flow = parseFlowPack(readJson(bytes, '플로우'));
      return {
        slug: null,
        title: flow.name,
        summary: flow.description,
        license: flow.license,
        label: null,
        file: new TextEncoder().encode(JSON.stringify(flow, null, 2)),
        preview: null,
        details: { team: flow.team, author: flow.author, steps: flow.steps },
        warnings: [],
      };
    }
    const playbook = parsePlaybook(readJson(bytes, '플레이북'));
    const chosen = license.trim().slice(0, 80);
    if (!chosen) throw new CommunityError('라이선스를 골라 주세요.');
    return {
      slug: null,
      title: playbook.name,
      summary: '',
      license: chosen,
      label: null,
      file: new TextEncoder().encode(JSON.stringify(playbook, null, 2)),
      preview: null,
      details: { team: playbook.team, staff: playbook.staff, stats: playbook.stats },
      warnings: [...new Set(playbook.staff.flatMap((s) => rulesWarnings(s.rules)))].map((w) => `규칙에 주의할 내용: ${w}`),
    };
  } catch (error) {
    throw asCommunityError(error);
  }
}

interface ItemRow {
  id: string;
  type: ItemType;
  slug: string;
  owner_id: string;
  title: string;
  summary: string;
  tags: string[];
  license: string;
  status: ItemStatus;
  hidden_reason: string | null;
  verified: boolean;
  latest_version: number;
  price_krw: number;
  downloads: number;
  likes: number;
  created_at: Date;
  updated_at: Date;
  owner_handle: string | null;
  owner_name: string;
  version_label: string;
  preview_key: string | null;
}

export interface ItemCard {
  id: string;
  type: ItemType;
  title: string;
  summary: string;
  tags: string[];
  license: string;
  verified: boolean;
  version: string;
  /** 0 for free. */
  priceKrw: number;
  downloads: number;
  likes: number;
  owner: { handle: string | null; name: string };
  preview: string | null;
  updatedAt: string;
  status?: ItemStatus;
}

const SELECT_ITEM = `
  SELECT i.*, p.handle AS owner_handle, a.name AS owner_name, v.label AS version_label, v.preview_key
  FROM items i
  JOIN accounts a ON a.id = i.owner_id
  LEFT JOIN profiles p ON p.account_id = i.owner_id
  JOIN item_versions v ON v.item_id = i.id AND v.version = i.latest_version`;

const card = (r: ItemRow, withStatus = false): ItemCard => ({
  id: r.id,
  type: r.type,
  title: r.title,
  summary: r.summary,
  tags: r.tags,
  license: r.license,
  verified: r.verified,
  version: r.version_label,
  priceKrw: r.price_krw,
  downloads: r.downloads,
  likes: r.likes,
  owner: { handle: r.owner_handle, name: r.owner_name },
  preview: r.preview_key ? `/api/items/${r.id}/preview` : null,
  updatedAt: new Date(r.updated_at).toISOString(),
  ...(withStatus ? { status: r.status } : {}),
});

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export class Community {
  private db: Db;
  private storage: FileStorage;
  private now: () => Date;

  constructor(db: Db, storage: FileStorage, now: () => Date = () => new Date()) {
    this.db = db;
    this.storage = storage;
    this.now = now;
  }

  private async row(id: string): Promise<ItemRow | null> {
    return (await this.db.query<ItemRow>(`${SELECT_ITEM} WHERE i.id = $1`, [id]))[0] ?? null;
  }

  private async bought(accountId: string, itemId: string) {
    return (await this.db.query("SELECT 1 FROM purchases WHERE account_id = $1 AND item_id = $2 AND status = 'paid'", [accountId, itemId])).length > 0;
  }

  /** Who may see an item that is not published: its owner and admins. */
  private canSee(row: ItemRow, account: Account | null) {
    if (row.status === 'published') return true;
    return !!account && row.status !== 'removed' && (account.id === row.owner_id || account.role === 'admin');
  }

  async upload(account: Account, input: { type: unknown; bytes: Uint8Array; item?: unknown; tags?: unknown; license?: unknown }) {
    if (account.status !== 'active') throw new CommunityError('올리기가 막힌 계정이에요.', 403);
    if (!isType(input.type)) throw new CommunityError('테마·플로우·플레이북 중 하나를 골라 주세요.');
    const type = input.type;
    const [{ n }] = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM item_versions v JOIN items i ON i.id = v.item_id WHERE i.owner_id = $1 AND v.created_at > $2`,
      [account.id, new Date(this.now().getTime() - DAY_MS)],
    );
    if (n >= UPLOADS_PER_DAY) throw new CommunityError('오늘은 더 올릴 수 없어요. 내일 다시 해 주세요.', 429);
    const checked = checkUpload(type, input.bytes, typeof input.license === 'string' ? input.license : 'CC-BY-4.0');
    const tags = parseTags(input.tags);

    // Which item this is a new version of: a theme by its id, others by the item the person picked.
    const existing = checked.slug
      ? (await this.db.query<ItemRow>('SELECT * FROM items WHERE type = $1 AND slug = $2', [type, checked.slug]))[0]
      : typeof input.item === 'string' && input.item
        ? ((await this.db.query<ItemRow>('SELECT * FROM items WHERE id = $1', [input.item]))[0] ?? null)
        : null;
    if (typeof input.item === 'string' && input.item && !existing) throw new CommunityError('새 버전을 올릴 항목이 없어요.', 404);
    if (existing && existing.owner_id !== account.id) {
      throw new CommunityError(checked.slug ? `테마 id '${checked.slug}'는 다른 사람이 이미 쓰고 있어요. theme.json의 id를 바꿔 주세요.` : '내가 올린 항목에만 새 버전을 올릴 수 있어요.', 409);
    }
    if (existing && existing.type !== type) throw new CommunityError('같은 종류로만 새 버전을 올릴 수 있어요.');
    if (existing?.status === 'removed') throw new CommunityError('삭제한 항목이에요.', 409);

    const itemId = existing?.id ?? newId();
    const version = (existing?.latest_version ?? 0) + 1;
    const label = checked.label ?? String(version);
    if (existing && checked.label) {
      const same = await this.db.query('SELECT 1 FROM item_versions WHERE item_id = $1 AND label = $2', [itemId, label]);
      if (same.length) throw new CommunityError(`${label} 버전은 이미 올렸어요. themeVersion을 올려 주세요.`, 409);
    }
    const fileKey = `items/${itemId}/${version}.${type === 'theme' ? 'zip' : 'json'}`;
    const previewKey = checked.preview ? `items/${itemId}/${version}-preview.${checked.preview.ext}` : null;
    await this.storage.put(fileKey, checked.file);
    if (previewKey) await this.storage.put(previewKey, checked.preview!.bytes);

    const now = this.now();
    await this.db.transaction(async (tx) => {
      if (existing) {
        await tx.query(
          `UPDATE items SET title = $2, summary = $3, license = $4, latest_version = $5, updated_at = $6, tags = CASE WHEN $7::jsonb = '[]'::jsonb THEN tags ELSE $7::jsonb END WHERE id = $1`,
          [itemId, checked.title, checked.summary, checked.license, version, now, JSON.stringify(tags)],
        );
      } else {
        await tx.query(
          `INSERT INTO items (id, type, slug, owner_id, title, summary, tags, license, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $9)`,
          [itemId, type, checked.slug ?? itemId, account.id, checked.title, checked.summary, JSON.stringify(tags), checked.license, now],
        );
      }
      await tx.query(
        `INSERT INTO item_versions (item_id, version, label, file_key, preview_key, size, sha256, details, warnings, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)`,
        [itemId, version, label, fileKey, previewKey, checked.file.byteLength, createHash('sha256').update(checked.file).digest('hex'), JSON.stringify(checked.details), JSON.stringify(checked.warnings), now],
      );
    });
    return { id: itemId, version, label, warnings: checked.warnings };
  }

  async list(query: { type?: unknown; q?: unknown; tag?: unknown; sort?: unknown; owner?: unknown; limit?: unknown; offset?: unknown }) {
    const where = ["i.status = 'published'"];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      where.push(sql.replaceAll('?', `$${params.length}`));
    };
    if (isType(query.type)) add('i.type = ?', query.type);
    const q = typeof query.q === 'string' ? query.q.trim().slice(0, 60) : '';
    if (q) add("(i.title ILIKE ? ESCAPE '\\' OR i.summary ILIKE ? ESCAPE '\\')", `%${escapeLike(q)}%`);
    const [tag] = parseTags(typeof query.tag === 'string' ? query.tag : '');
    if (tag) add('i.tags @> ?::jsonb', JSON.stringify([tag]));
    if (typeof query.owner === 'string' && query.owner) add('p.handle = ?', query.owner);
    const popular = () => {
      // Popular lately: downloads in the last 30 days plus likes, weighted.
      params.push(new Date(this.now().getTime() - 30 * DAY_MS).toISOString().slice(0, 10));
      return `(COALESCE((SELECT sum(d.count) FROM item_downloads d WHERE d.item_id = i.id AND d.day >= $${params.length}::date), 0) + 3 * i.likes) DESC, i.updated_at DESC`;
    };
    const order = query.sort === 'new' ? 'i.created_at DESC' : query.sort === 'downloads' ? 'i.downloads DESC, i.updated_at DESC' : popular();
    const limit = Math.min(48, Math.max(1, Number(query.limit) || 24));
    const offset = Math.max(0, Number(query.offset) || 0);
    const rows = await this.db.query<ItemRow & { total: number }>(
      `${SELECT_ITEM.replace('SELECT i.*', 'SELECT i.*, count(*) OVER ()::int AS total')} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    return { items: rows.map((r) => card(r)), total: rows[0]?.total ?? 0 };
  }

  async mine(account: Account) {
    const rows = await this.db.query<ItemRow>(`${SELECT_ITEM} WHERE i.owner_id = $1 AND i.status <> 'removed' ORDER BY i.updated_at DESC`, [account.id]);
    return rows.map((r) => card(r, true));
  }

  async detail(id: string, account: Account | null) {
    const row = await this.row(id);
    if (!row || !this.canSee(row, account)) throw new CommunityError('없는 항목이에요.', 404);
    const versions = await this.db.query<{ version: number; label: string; size: number; sha256: string; details: Record<string, unknown>; warnings: string[]; created_at: Date }>(
      'SELECT version, label, size, sha256, details, warnings, created_at FROM item_versions WHERE item_id = $1 ORDER BY version DESC',
      [id],
    );
    const liked = account ? (await this.db.query('SELECT 1 FROM item_likes WHERE item_id = $1 AND account_id = $2', [id, account.id])).length > 0 : false;
    const mine = !!account && account.id === row.owner_id;
    const owned = row.price_krw === 0 || mine || (!!account && (await this.bought(account.id, id)));
    return {
      ...card(row, mine || account?.role === 'admin'),
      liked,
      mine,
      owned,
      hiddenReason: mine || account?.role === 'admin' ? row.hidden_reason : undefined,
      details: versions[0]?.details ?? {},
      warnings: versions[0]?.warnings ?? [],
      versions: versions.map((v) => ({ version: v.version, label: v.label, size: v.size, sha256: v.sha256, createdAt: new Date(v.created_at).toISOString() })),
    };
  }

  async preview(id: string) {
    const row = await this.row(id);
    if (!row || row.status === 'removed' || !row.preview_key) return null;
    const bytes = await this.storage.get(row.preview_key);
    return bytes && { bytes, contentType: CONTENT_TYPES[extOf(row.preview_key)] ?? 'application/octet-stream' };
  }

  /** The stored file of a version (latest by default). Counts a download for published items. */
  async download(id: string, account: Account | null, version?: unknown) {
    const row = await this.row(id);
    if (!row || !this.canSee(row, account)) throw new CommunityError('없는 항목이에요.', 404);
    if (row.price_krw > 0 && !(account && (account.id === row.owner_id || account.role === 'admin' || (await this.bought(account.id, id))))) {
      throw new CommunityError('유료 테마예요. 사이트에서 산 뒤 내려받을 수 있어요.', 402);
    }
    const n = version === undefined || version === '' ? row.latest_version : Number(version);
    const [v] = await this.db.query<{ file_key: string; label: string }>('SELECT file_key, label FROM item_versions WHERE item_id = $1 AND version = $2', [id, n]);
    if (!v) throw new CommunityError('없는 버전이에요.', 404);
    const bytes = await this.storage.get(v.file_key);
    if (!bytes) throw new CommunityError('파일을 찾을 수 없어요.', 404);
    if (row.status === 'published') {
      const day = this.now().toISOString().slice(0, 10);
      await this.db.transaction(async (tx) => {
        await tx.query('UPDATE items SET downloads = downloads + 1 WHERE id = $1', [id]);
        await tx.query(
          'INSERT INTO item_downloads (item_id, day, count) VALUES ($1, $2, 1) ON CONFLICT (item_id, day) DO UPDATE SET count = item_downloads.count + 1',
          [id, day],
        );
      });
    }
    const name = row.type === 'theme' ? `${row.slug}-${v.label}.zip` : `${row.type}-${row.id.slice(4)}-${v.label}.${row.type}.json`;
    return { bytes, name, type: row.type, contentType: row.type === 'theme' ? 'application/zip' : 'application/json; charset=utf-8' };
  }

  async like(id: string, account: Account, on: boolean) {
    const row = await this.row(id);
    if (!row || row.status !== 'published') throw new CommunityError('없는 항목이에요.', 404);
    await this.db.transaction(async (tx) => {
      const changed = on
        ? await tx.query('INSERT INTO item_likes (item_id, account_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING 1', [id, account.id, this.now()])
        : await tx.query('DELETE FROM item_likes WHERE item_id = $1 AND account_id = $2 RETURNING 1', [id, account.id]);
      if (changed.length) await tx.query(`UPDATE items SET likes = likes ${on ? '+' : '-'} 1 WHERE id = $1`, [id]);
    });
    const [{ likes }] = await this.db.query<{ likes: number }>('SELECT likes FROM items WHERE id = $1', [id]);
    return { liked: on, likes };
  }

  async report(id: string, account: Account, reason: unknown) {
    const text = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
    if (!text) throw new CommunityError('신고 이유를 적어 주세요.');
    const row = await this.row(id);
    if (!row || row.status !== 'published') throw new CommunityError('없는 항목이에요.', 404);
    if (row.owner_id === account.id) throw new CommunityError('내 항목은 신고할 수 없어요.');
    await this.db.query(
      'INSERT INTO item_reports (item_id, account_id, reason, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (item_id, account_id) DO UPDATE SET reason = EXCLUDED.reason',
      [id, account.id, text, this.now()],
    );
    const [{ n }] = await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM item_reports WHERE item_id = $1 AND resolved_at IS NULL', [id]);
    if (n >= REPORTS_TO_HIDE) await this.db.query("UPDATE items SET status = 'hidden', hidden_reason = 'reports' WHERE id = $1", [id]);
    return { ok: true };
  }

  /** Owners publish, hide or remove their items; an item hidden by reports comes back only through an admin. */
  async setStatus(id: string, account: Account, status: unknown) {
    if (status !== 'published' && status !== 'hidden' && status !== 'removed') throw new CommunityError('없는 상태예요.');
    const row = await this.row(id);
    const admin = account.role === 'admin';
    if (!row || row.status === 'removed' || (row.owner_id !== account.id && !admin)) throw new CommunityError('없는 항목이에요.', 404);
    if (status === 'published' && row.hidden_reason && !admin) throw new CommunityError('신고로 가려진 항목이에요. 운영자가 확인한 뒤 다시 공개돼요.', 403);
    await this.db.query('UPDATE items SET status = $2, hidden_reason = CASE WHEN $2 = \'published\' THEN NULL ELSE hidden_reason END WHERE id = $1', [id, status]);
    if (status === 'published' && admin) await this.db.query('UPDATE item_reports SET resolved_at = $2 WHERE item_id = $1 AND resolved_at IS NULL', [id, this.now()]);
    return status === 'removed' ? { id, status } : this.detail(id, account);
  }

  async setVerified(id: string, account: Account, verified: boolean) {
    if (account.role !== 'admin') throw new CommunityError('운영자만 할 수 있어요.', 403);
    const changed = await this.db.query('UPDATE items SET verified = $2 WHERE id = $1 RETURNING 1', [id, verified]);
    if (!changed.length) throw new CommunityError('없는 항목이에요.', 404);
    return this.detail(id, account);
  }
}
