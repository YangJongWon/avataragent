import { createPublicKey, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PERIOD_DAYS } from '../../shared/billing.ts';
import { INSTALL_ID, type LicensePayload, type LicenseStatus } from '../../shared/license.ts';
import { isPlan, planOf, type Plan } from '../../shared/plans.ts';
import { newLicenseKeys, signLicense, verifyLicense } from '../../server/license-crypto.ts';
import type { Db } from './db.ts';
import type { PaymentEvent, PaymentProvider } from './payments.ts';

/**
 * Plan sales on the site: checkout → subscription → one license bound to one install. Installs fetch fresh
 * licenses with `refresh`; the site never calls an install.
 */

export class BillingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const DAY_MS = 86_400_000;
const id = (prefix: string) => `${prefix}_${randomBytes(12).toString('base64url')}`;

interface SubscriptionRow {
  id: string;
  account_id: string;
  plan: Plan;
  status: LicenseStatus;
  provider: string;
  provider_ref: string | null;
  period_end: Date;
  cancel_at_period_end: boolean;
}

interface LicenseRow {
  id: string;
  subscription_id: string;
  account_id: string;
  install_id: string;
}

export interface LicenseKey {
  kid: string;
  privateKey: string;
  publicKey: string;
}

/** The configured signing key, or in development one made once and kept in the data folder. */
export function licenseKey(configured: { kid: string; privateKey: string } | null, dataDir: string): LicenseKey {
  if (configured) return { ...configured, publicKey: createPublicKey(configured.privateKey).export({ type: 'spki', format: 'pem' }).toString() };
  const file = join(dataDir || '.', 'license-key.json');
  if (dataDir && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as LicenseKey;
  const made = { kid: 'dev', ...newLicenseKeys() };
  if (dataDir) {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(file, JSON.stringify(made));
  }
  return made;
}

export class SiteBilling {
  private db: Db;
  private provider: PaymentProvider;
  private key: LicenseKey;
  private publicUrl: string;
  private now: () => Date;

  constructor(db: Db, provider: PaymentProvider, key: LicenseKey, publicUrl: string, now: () => Date = () => new Date()) {
    this.db = db;
    this.provider = provider;
    this.key = key;
    this.publicUrl = publicUrl;
    this.now = now;
  }

  get publicKey() {
    return { kid: this.key.kid, pem: this.key.publicKey };
  }

  // ── checkout ───────────────────────────────────────────────
  async startPlanCheckout(accountId: string, input: { plan: unknown; install: unknown; ref?: unknown; returnUrl?: unknown }) {
    if (!isPlan(input.plan) || planOf(input.plan).priceKrw === 0) throw new BillingError('살 수 있는 플랜이 아니에요.');
    if (typeof input.install !== 'string' || !INSTALL_ID.test(input.install)) throw new BillingError('설치 정보가 올바르지 않아요. 앱의 플랜 화면에서 다시 시작해 주세요.');
    const returnUrl = typeof input.returnUrl === 'string' ? input.returnUrl : '';
    if (returnUrl && (!/^https?:\/\//.test(returnUrl) || returnUrl.length > 500)) throw new BillingError('돌아갈 주소가 올바르지 않아요.');
    const ref = typeof input.ref === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(input.ref) ? input.ref : null;
    const meta = planOf(input.plan);
    const checkoutId = id('chk');
    await this.db.query(
      'INSERT INTO checkouts (id, account_id, kind, plan, install_id, app_ref, return_url, amount_krw, provider) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [checkoutId, accountId, 'plan', meta.id, input.install, ref, returnUrl || null, meta.priceKrw, this.provider.id],
    );
    return this.provider.createCheckout({ id: checkoutId, amountKrw: meta.priceKrw, title: `${meta.label} 플랜 (월)` }, this.publicUrl);
  }

  async checkout(accountId: string, checkoutId: string) {
    const [row] = await this.db.query<{ id: string; plan: Plan; amount_krw: number; status: string; return_url: string | null; install_id: string }>(
      'SELECT id, plan, amount_krw, status, return_url, install_id FROM checkouts WHERE id = $1 AND account_id = $2',
      [checkoutId, accountId],
    );
    if (!row) throw new BillingError('없는 결제예요.', 404);
    return { id: row.id, plan: row.plan, amountKrw: row.amount_krw, status: row.status, installId: row.install_id, returnHost: row.return_url ? new URL(row.return_url).host : null };
  }

  // ── events ─────────────────────────────────────────────────
  /**
   * Applies one payment event; repeats are ignored. For a paid plan checkout, returns where to send the browser:
   * back to the install with the license attached.
   */
  async handle(event: PaymentEvent): Promise<{ redirect: string | null }> {
    return this.db.transaction(async (tx) => {
      const seen = await tx.query('SELECT 1 FROM payments WHERE provider = $1 AND event_id = $2', [this.provider.id, event.id]);
      if (seen.length) return { redirect: null };
      const record = (kind: string, values: { account?: string | null; subscription?: string | null; checkout?: string | null; amount?: number }) =>
        tx.query('INSERT INTO payments (id, provider, event_id, kind, account_id, subscription_id, checkout_id, amount_krw) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [
          id('pay'),
          this.provider.id,
          event.id,
          kind,
          values.account ?? null,
          values.subscription ?? null,
          values.checkout ?? null,
          values.amount ?? 0,
        ]);
      const now = this.now();

      if (event.kind === 'checkout.paid' || event.kind === 'checkout.failed') {
        const [checkout] = await tx.query<{ id: string; account_id: string; plan: Plan; install_id: string; app_ref: string | null; return_url: string | null; amount_krw: number; status: string }>(
          "SELECT * FROM checkouts WHERE id = $1 AND kind = 'plan'",
          [event.checkoutId],
        );
        if (!checkout || checkout.status !== 'open') throw new BillingError('끝났거나 없는 결제예요.', 409);
        if (event.kind === 'checkout.failed') {
          await tx.query("UPDATE checkouts SET status = 'failed' WHERE id = $1", [checkout.id]);
          await record(event.kind, { account: checkout.account_id, checkout: checkout.id });
          return { redirect: null };
        }
        const subscriptionId = id('sub');
        const licenseId = id('lic');
        await tx.query("UPDATE checkouts SET status = 'paid' WHERE id = $1", [checkout.id]);
        await tx.query("INSERT INTO subscriptions (id, account_id, plan, status, provider, provider_ref, period_end) VALUES ($1, $2, $3, 'active', $4, $5, $6)", [
          subscriptionId,
          checkout.account_id,
          checkout.plan,
          this.provider.id,
          event.providerRef,
          new Date(now.getTime() + PERIOD_DAYS * DAY_MS),
        ]);
        await tx.query('INSERT INTO licenses (id, subscription_id, account_id, install_id) VALUES ($1, $2, $3, $4)', [licenseId, subscriptionId, checkout.account_id, checkout.install_id]);
        await record(event.kind, { account: checkout.account_id, subscription: subscriptionId, checkout: checkout.id, amount: checkout.amount_krw });
        const token = await this.tokenWith(tx, licenseId);
        if (!checkout.return_url) return { redirect: null };
        const back = new URL(checkout.return_url);
        back.searchParams.set('license', token);
        if (checkout.app_ref) back.searchParams.set('ref', checkout.app_ref);
        return { redirect: back.toString() };
      }

      const [sub] = await tx.query<SubscriptionRow>('SELECT * FROM subscriptions WHERE provider = $1 AND provider_ref = $2', [this.provider.id, event.providerRef]);
      if (!sub) throw new BillingError('없는 구독이에요.', 404);
      if (event.kind === 'renewal.paid') {
        const from = Math.max(now.getTime(), new Date(sub.period_end).getTime());
        await tx.query("UPDATE subscriptions SET status = 'active', period_end = $2 WHERE id = $1", [sub.id, new Date(from + PERIOD_DAYS * DAY_MS)]);
        await record(event.kind, { account: sub.account_id, subscription: sub.id, amount: event.amountKrw });
      } else if (event.kind === 'renewal.failed') {
        await tx.query("UPDATE subscriptions SET status = 'past_due' WHERE id = $1", [sub.id]);
        await record(event.kind, { account: sub.account_id, subscription: sub.id });
      } else {
        await tx.query("UPDATE subscriptions SET status = 'canceled' WHERE id = $1", [sub.id]);
        await record(event.kind, { account: sub.account_id, subscription: sub.id });
      }
      return { redirect: null };
    });
  }

  // ── licenses ───────────────────────────────────────────────
  private async tokenWith(q: Pick<Db, 'query'>, licenseId: string): Promise<string> {
    const [row] = await q.query<LicenseRow & SubscriptionRow & { license_id: string }>(
      'SELECT l.id AS license_id, l.install_id, s.* FROM licenses l JOIN subscriptions s ON s.id = l.subscription_id WHERE l.id = $1',
      [licenseId],
    );
    if (!row) throw new BillingError('없는 라이선스예요.', 404);
    const payload: LicensePayload = {
      v: 1,
      kid: this.key.kid,
      lic: row.license_id,
      account: row.account_id,
      plan: row.plan,
      seats: planOf(row.plan).maxMembers,
      install: row.install_id,
      periodEnd: new Date(row.period_end).toISOString(),
      issuedAt: this.now().toISOString(),
      status: row.status,
    };
    return signLicense(payload, this.key.privateKey);
  }

  /** A fresh token for an install holding an older one. 404/409 tell the install the license is gone or moved. */
  async refresh(token: unknown, install: unknown) {
    let old: LicensePayload;
    try {
      old = verifyLicense(String(token ?? ''), { [this.key.kid]: this.key.publicKey });
    } catch {
      throw new BillingError('이 사이트가 발급한 라이선스가 아니에요.', 400);
    }
    const [license] = await this.db.query<LicenseRow>('SELECT * FROM licenses WHERE id = $1', [old.lic]);
    if (!license) throw new BillingError('없는 라이선스예요.', 404);
    if (license.install_id !== install || old.install !== install) throw new BillingError('다른 설치로 옮겨진 라이선스예요.', 409);
    return { token: await this.tokenWith(this.db, license.id) };
  }

  async licenses(accountId: string) {
    const rows = await this.db.query<LicenseRow & SubscriptionRow & { license_id: string; subscription_id: string }>(
      'SELECT l.id AS license_id, l.install_id, s.* , s.id AS subscription_id FROM licenses l JOIN subscriptions s ON s.id = l.subscription_id WHERE l.account_id = $1 ORDER BY s.created_at DESC',
      [accountId],
    );
    return Promise.all(
      rows.map(async (r) => ({
        id: r.license_id,
        subscriptionId: r.subscription_id,
        plan: r.plan,
        status: r.status,
        periodEnd: new Date(r.period_end).toISOString(),
        cancelAtPeriodEnd: r.cancel_at_period_end,
        installId: r.install_id,
        token: await this.tokenWith(this.db, r.license_id),
      })),
    );
  }

  /** Moves a license to another install (a new PC); the old install's next refresh finds it gone. */
  async transfer(accountId: string, licenseId: string, install: unknown) {
    if (typeof install !== 'string' || !INSTALL_ID.test(install)) throw new BillingError('설치 ID가 올바르지 않아요. 앱의 플랜 화면에 있는 값을 붙여 넣어 주세요.');
    const moved = await this.db.query('UPDATE licenses SET install_id = $3, bound_at = $4 WHERE id = $1 AND account_id = $2 RETURNING id', [licenseId, accountId, install, this.now()]);
    if (!moved.length) throw new BillingError('없는 라이선스예요.', 404);
    return { token: await this.tokenWith(this.db, licenseId) };
  }

  async setCancel(accountId: string, subscriptionId: string, cancel: boolean) {
    const [sub] = await this.db.query<SubscriptionRow>('SELECT * FROM subscriptions WHERE id = $1 AND account_id = $2', [subscriptionId, accountId]);
    if (!sub) throw new BillingError('없는 구독이에요.', 404);
    if (sub.status === 'canceled') throw new BillingError('이미 끝난 구독이에요.');
    if (sub.provider_ref) await (cancel ? this.provider.cancel(sub.provider_ref) : this.provider.resume(sub.provider_ref));
    await this.db.query('UPDATE subscriptions SET cancel_at_period_end = $2 WHERE id = $1', [sub.id, cancel]);
  }

  /** Hourly: ends subscriptions cancelled at period end, and charges renewals for self-renewing providers (mock). */
  async tick() {
    const now = this.now();
    const due = await this.db.query<SubscriptionRow>("SELECT * FROM subscriptions WHERE status = 'active' AND period_end <= $1", [now]);
    for (const sub of due) {
      if (sub.cancel_at_period_end) {
        await this.db.query("UPDATE subscriptions SET status = 'canceled' WHERE id = $1", [sub.id]);
      } else if (this.provider.selfRenewing && sub.provider_ref) {
        await this.handle({ id: `renew_${sub.id}_${new Date(sub.period_end).getTime()}`, kind: 'renewal.paid', providerRef: sub.provider_ref, amountKrw: planOf(sub.plan).priceKrw });
      }
    }
  }
}
