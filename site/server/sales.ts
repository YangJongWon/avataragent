import { randomBytes } from 'node:crypto';
import type { Account } from './auth.ts';
import { BillingError } from './billing.ts';
import type { Db } from './db.ts';
import { audit, requireAdmin } from './moderation.ts';
import type { PaymentProvider } from './payments.ts';

/**
 * Paid themes. A creator puts a price on a theme; a purchase unlocks its downloads for the buyer; every sale,
 * fee, refund and payout is a signed row in the ledger, so a creator's balance is just the sum of their rows.
 * Payouts are recorded by an admin after sending the money by hand, until a provider can pay out.
 */

export const PRICE = { min: 1_000, max: 100_000, step: 100 };
/** The creator keeps 70%; the site keeps 30% to run payments, hosting and review. */
export const CREATOR_SHARE = 0.7;
export const feeOf = (price: number) => price - Math.floor(price * CREATOR_SHARE);

const id = (prefix: string) => `${prefix}_${randomBytes(12).toString('base64url')}`;

export function parsePrice(raw: unknown): number {
  const price = Number(raw);
  if (price === 0) return 0;
  if (!Number.isInteger(price) || price < PRICE.min || price > PRICE.max || price % PRICE.step !== 0) {
    throw new BillingError(`가격은 0원(무료)이나 ${PRICE.min.toLocaleString()}~${PRICE.max.toLocaleString()}원 사이 ${PRICE.step}원 단위로 정해 주세요.`);
  }
  return price;
}

interface CheckoutRow {
  id: string;
  account_id: string;
  item_id: string;
  amount_krw: number;
}

/** Called inside the payment transaction when an item checkout is paid. */
export async function recordSale(tx: Pick<Db, 'query'>, checkout: CheckoutRow, provider: string, providerRef: string | null, now: Date) {
  const [item] = await tx.query<{ owner_id: string }>('SELECT owner_id FROM items WHERE id = $1', [checkout.item_id]);
  if (!item) throw new BillingError('없는 항목이에요.', 404);
  const purchaseId = id('pur');
  const fee = feeOf(checkout.amount_krw);
  await tx.query(
    'INSERT INTO purchases (id, account_id, item_id, creator_id, checkout_id, provider, provider_ref, amount_krw, fee_krw, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
    [purchaseId, checkout.account_id, checkout.item_id, item.owner_id, checkout.id, provider, providerRef, checkout.amount_krw, fee, now],
  );
  await tx.query(
    "INSERT INTO ledger (creator_id, kind, amount_krw, purchase_id, created_at) VALUES ($1, 'sale', $2, $3, $5), ($1, 'fee', $4, $3, $5)",
    [item.owner_id, checkout.amount_krw, purchaseId, -fee, now],
  );
  return purchaseId;
}

export class Sales {
  private db: Db;
  private provider: PaymentProvider;
  private publicUrl: string;
  private now: () => Date;

  constructor(db: Db, provider: PaymentProvider, publicUrl: string, now: () => Date = () => new Date()) {
    this.db = db;
    this.provider = provider;
    this.publicUrl = publicUrl;
    this.now = now;
  }

  async setPrice(account: Account, itemId: string, raw: unknown) {
    const price = parsePrice(raw);
    const [item] = await this.db.query<{ owner_id: string; type: string; status: string }>('SELECT owner_id, type, status FROM items WHERE id = $1', [itemId]);
    if (!item || item.status === 'removed' || item.owner_id !== account.id) throw new BillingError('없는 항목이에요.', 404);
    if (account.status !== 'active') throw new BillingError('판매가 막힌 계정이에요.', 403);
    if (price > 0 && item.type !== 'theme') throw new BillingError('지금은 테마만 팔 수 있어요.');
    await this.db.query('UPDATE items SET price_krw = $2 WHERE id = $1', [itemId, price]);
    return { priceKrw: price };
  }

  async owns(accountId: string, itemId: string) {
    return (await this.db.query("SELECT 1 FROM purchases WHERE account_id = $1 AND item_id = $2 AND status = 'paid'", [accountId, itemId])).length > 0;
  }

  async startCheckout(account: Account, itemId: string) {
    const [item] = await this.db.query<{ owner_id: string; title: string; status: string; price_krw: number }>(
      'SELECT owner_id, title, status, price_krw FROM items WHERE id = $1',
      [itemId],
    );
    if (!item || item.status !== 'published') throw new BillingError('없는 항목이에요.', 404);
    if (item.price_krw === 0) throw new BillingError('무료 항목이에요. 바로 내려받으세요.');
    if (item.owner_id === account.id) throw new BillingError('내 항목은 살 필요가 없어요.');
    if (await this.owns(account.id, itemId)) throw new BillingError('이미 산 항목이에요.', 409);
    const checkoutId = id('chk');
    await this.db.query(
      "INSERT INTO checkouts (id, account_id, kind, item_id, return_url, amount_krw, provider) VALUES ($1, $2, 'item', $3, $4, $5, $6)",
      [checkoutId, account.id, itemId, `${this.publicUrl}/community/items/${itemId}?bought=1`, item.price_krw, this.provider.id],
    );
    return this.provider.createCheckout({ id: checkoutId, kind: 'item', amountKrw: item.price_krw, title: item.title }, this.publicUrl);
  }

  async purchases(account: Account) {
    const rows = await this.db.query<{ id: string; item_id: string; title: string; amount_krw: number; status: string; created_at: Date; item_status: string }>(
      `SELECT pu.id, pu.item_id, i.title, pu.amount_krw, pu.status, pu.created_at, i.status AS item_status
       FROM purchases pu JOIN items i ON i.id = pu.item_id WHERE pu.account_id = $1 ORDER BY pu.created_at DESC`,
      [account.id],
    );
    return rows.map((r) => ({
      id: r.id,
      itemId: r.item_id,
      title: r.title,
      amountKrw: r.amount_krw,
      status: r.status,
      available: r.status === 'paid' && r.item_status !== 'removed',
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  private async balanceOf(q: Pick<Db, 'query'>, creatorId: string) {
    const [row] = await q.query<{ balance: number }>('SELECT COALESCE(sum(amount_krw), 0)::int AS balance FROM ledger WHERE creator_id = $1', [creatorId]);
    return row.balance;
  }

  async earnings(account: Account) {
    const [totals] = await this.db.query<{ gross: number; fees: number; refunds: number; payouts: number; sales: number }>(
      `SELECT
         COALESCE(sum(amount_krw) FILTER (WHERE kind = 'sale'), 0)::int AS gross,
         COALESCE(-sum(amount_krw) FILTER (WHERE kind IN ('fee', 'fee_refund')), 0)::int AS fees,
         COALESCE(-sum(amount_krw) FILTER (WHERE kind = 'refund'), 0)::int AS refunds,
         COALESCE(-sum(amount_krw) FILTER (WHERE kind = 'payout'), 0)::int AS payouts,
         count(*) FILTER (WHERE kind = 'sale')::int AS sales
       FROM ledger WHERE creator_id = $1`,
      [account.id],
    );
    const rows = await this.db.query<{ kind: string; amount_krw: number; note: string; created_at: Date; title: string | null }>(
      `SELECT l.kind, l.amount_krw, l.note, l.created_at, i.title
       FROM ledger l LEFT JOIN purchases pu ON pu.id = l.purchase_id LEFT JOIN items i ON i.id = pu.item_id
       WHERE l.creator_id = $1 ORDER BY l.created_at DESC, l.id DESC LIMIT 100`,
      [account.id],
    );
    return {
      balance: await this.balanceOf(this.db, account.id),
      ...totals,
      share: CREATOR_SHARE,
      entries: rows.map((r) => ({ kind: r.kind, amountKrw: r.amount_krw, note: r.note, title: r.title, at: new Date(r.created_at).toISOString() })),
    };
  }

  // ── admin ──────────────────────────────────────────────────
  /** Every creator with ledger rows, largest balance first. */
  async balances(admin: Account) {
    requireAdmin(admin);
    return this.db.query<{ creatorId: string; handle: string | null; email: string; balance: number; gross: number; lastPayout: Date | null }>(
      `SELECT l.creator_id AS "creatorId", p.handle, a.email,
              sum(l.amount_krw)::int AS balance,
              COALESCE(sum(l.amount_krw) FILTER (WHERE l.kind = 'sale'), 0)::int AS gross,
              max(l.created_at) FILTER (WHERE l.kind = 'payout') AS "lastPayout"
       FROM ledger l JOIN accounts a ON a.id = l.creator_id LEFT JOIN profiles p ON p.account_id = l.creator_id
       GROUP BY l.creator_id, p.handle, a.email ORDER BY balance DESC`,
    );
  }

  async sales(admin: Account) {
    requireAdmin(admin);
    const rows = await this.db.query<{ id: string; title: string; buyer: string; seller: string | null; amount_krw: number; fee_krw: number; status: string; created_at: Date }>(
      `SELECT pu.id, i.title, a.email AS buyer, p.handle AS seller, pu.amount_krw, pu.fee_krw, pu.status, pu.created_at
       FROM purchases pu JOIN items i ON i.id = pu.item_id JOIN accounts a ON a.id = pu.account_id LEFT JOIN profiles p ON p.account_id = pu.creator_id
       ORDER BY pu.created_at DESC LIMIT 100`,
    );
    return rows.map((r) => ({ id: r.id, title: r.title, buyer: r.buyer, seller: r.seller, amountKrw: r.amount_krw, feeKrw: r.fee_krw, status: r.status, at: new Date(r.created_at).toISOString() }));
  }

  /** Gives the money back and takes the download away; the creator's share and the site's fee are both reversed. */
  async refund(admin: Account, purchaseId: string, reason: unknown) {
    requireAdmin(admin);
    const why = typeof reason === 'string' ? reason.trim().slice(0, 300) : '';
    if (!why) throw new BillingError('환불 이유를 적어 주세요.');
    const [purchase] = await this.db.query<{ id: string; creator_id: string; amount_krw: number; fee_krw: number; status: string; provider: string; provider_ref: string | null }>(
      'SELECT * FROM purchases WHERE id = $1',
      [purchaseId],
    );
    if (!purchase) throw new BillingError('없는 구매예요.', 404);
    if (purchase.status !== 'paid') throw new BillingError('이미 환불한 구매예요.', 409);
    if (purchase.provider === this.provider.id && purchase.provider_ref && this.provider.refund) await this.provider.refund(purchase.provider_ref, purchase.amount_krw);
    const now = this.now();
    await this.db.transaction(async (tx) => {
      await tx.query("UPDATE purchases SET status = 'refunded', refunded_at = $2 WHERE id = $1", [purchase.id, now]);
      await tx.query(
        "INSERT INTO ledger (creator_id, kind, amount_krw, purchase_id, note, actor_id, created_at) VALUES ($1, 'refund', $2, $3, $5, $6, $7), ($1, 'fee_refund', $4, $3, $5, $6, $7)",
        [purchase.creator_id, -purchase.amount_krw, purchase.id, purchase.fee_krw, why, admin.id, now],
      );
      await audit(tx, admin, 'purchase.refund', purchase.id, { reason: why, amountKrw: purchase.amount_krw });
    });
    return { ok: true };
  }

  /** Records money sent to a creator by hand; it can never take a balance below zero. */
  async payout(admin: Account, creatorId: string, rawAmount: unknown, note: unknown) {
    requireAdmin(admin);
    const amount = Number(rawAmount);
    if (!Number.isInteger(amount) || amount <= 0) throw new BillingError('보낸 금액을 원 단위로 적어 주세요.');
    const memo = typeof note === 'string' ? note.trim().slice(0, 200) : '';
    return this.db.transaction(async (tx) => {
      // Lock the creator's rows so two payouts at once cannot both pass the balance check.
      await tx.query('SELECT id FROM accounts WHERE id = $1 FOR UPDATE', [creatorId]);
      const balance = await this.balanceOf(tx, creatorId);
      if (amount > balance) throw new BillingError(`남은 금액(${balance.toLocaleString()}원)보다 많이 지급할 수 없어요.`);
      await tx.query("INSERT INTO ledger (creator_id, kind, amount_krw, note, actor_id, created_at) VALUES ($1, 'payout', $2, $3, $4, $5)", [
        creatorId,
        -amount,
        memo,
        admin.id,
        this.now(),
      ]);
      await audit(tx, admin, 'ledger.payout', creatorId, { amountKrw: amount, note: memo });
      return { balance: balance - amount };
    });
  }
}
