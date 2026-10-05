import assert from 'node:assert/strict';
import test from 'node:test';

const { migrate, openDb } = await import('../site/server/db.ts');
const { SiteBilling, licenseKey } = await import('../site/server/billing.ts');
const { mockOutcome, mockPayments } = await import('../site/server/payments.ts');
const { verifyLicense } = await import('../server/license-crypto.ts');

const INSTALL = 'ins_abcdefghijklmnop1234';
const OTHER = 'ins_zyxwvutsrqponmlk9876';
const DAY = 86_400_000;

async function setup() {
  const db = await openDb();
  await migrate(db);
  await db.query("INSERT INTO accounts (id, email) VALUES ('acc_1', 'buyer@example.com'), ('acc_2', 'other@example.com')");
  let now = new Date('2026-10-05T00:00:00Z');
  const key = licenseKey(null, '');
  const billing = new SiteBilling(db, mockPayments, key, 'http://site.test', () => now);
  const verify = (token: string) => verifyLicense(token, { [key.kid]: key.publicKey });
  const buy = async (plan = 'team', install = INSTALL) => {
    const { url } = await billing.startPlanCheckout('acc_1', { plan, install, ref: 'chk_app1', returnUrl: 'http://192.168.0.5:8787/billing/return' });
    const checkoutId = url.split('/').pop()!;
    return { checkoutId, ...(await billing.handle(mockOutcome(checkoutId, true))) };
  };
  return { db, billing, verify, buy, advance: (ms: number) => (now = new Date(now.getTime() + ms)), close: () => db.close() };
}

test('paying for a plan issues a license bound to the install and sends the browser back with it', async () => {
  const s = await setup();
  const { checkoutId, redirect } = await s.buy();
  assert.ok(checkoutId.startsWith('chk_'));
  const back = new URL(redirect!);
  assert.equal(back.origin + back.pathname, 'http://192.168.0.5:8787/billing/return');
  assert.equal(back.searchParams.get('ref'), 'chk_app1');
  const license = s.verify(back.searchParams.get('license')!);
  assert.equal(license.plan, 'team');
  assert.equal(license.seats, 10);
  assert.equal(license.install, INSTALL);
  assert.equal(license.status, 'active');
  assert.equal(license.periodEnd, '2026-11-04T00:00:00.000Z');
  assert.deepEqual(await s.db.query('SELECT status FROM checkouts'), [{ status: 'paid' }]);
  await s.close();
});

test('checkouts are validated, failures recorded and repeats ignored', async () => {
  const s = await setup();
  await assert.rejects(s.billing.startPlanCheckout('acc_1', { plan: 'personal', install: INSTALL }), /살 수 있는 플랜/);
  await assert.rejects(s.billing.startPlanCheckout('acc_1', { plan: 'team', install: 'bad' }), /설치 정보/);
  await assert.rejects(s.billing.startPlanCheckout('acc_1', { plan: 'team', install: INSTALL, returnUrl: 'javascript:alert(1)' }), /돌아갈 주소/);

  const { url } = await s.billing.startPlanCheckout('acc_1', { plan: 'business', install: INSTALL });
  const id = url.split('/').pop()!;
  await assert.rejects(s.billing.checkout('acc_2', id), /없는 결제/, 'only the buyer sees the checkout');
  const failed = mockOutcome(id, false);
  await s.billing.handle(failed);
  assert.deepEqual(await s.billing.handle(failed), { redirect: null }, 'a repeated event changes nothing');
  await assert.rejects(s.billing.handle(mockOutcome(id, true)), /끝났거나/);
  assert.deepEqual(await s.db.query('SELECT count(*)::int AS n FROM licenses'), [{ n: 0 }]);
  await s.close();
});

test('installs refresh their license; a moved license is gone for the old install', async () => {
  const s = await setup();
  const { redirect } = await s.buy();
  const token = new URL(redirect!).searchParams.get('license')!;
  const { token: fresh } = await s.billing.refresh(token, INSTALL);
  assert.equal(s.verify(fresh).lic, s.verify(token).lic);

  const [license] = await s.billing.licenses('acc_1');
  const { token: moved } = await s.billing.transfer('acc_1', license.id, OTHER);
  assert.equal(s.verify(moved).install, OTHER);
  await assert.rejects(s.billing.refresh(token, INSTALL), (e: Error & { status?: number }) => e.status === 409);
  assert.equal(s.verify((await s.billing.refresh(moved, OTHER)).token).install, OTHER);
  await assert.rejects(s.billing.transfer('acc_2', license.id, INSTALL), /없는 라이선스/, 'only the owner moves it');
  await assert.rejects(s.billing.refresh('forged.token', INSTALL), /발급한 라이선스가 아니에요/);
  await s.close();
});

test('mock subscriptions renew on the site clock; cancelled ones end at period end', async () => {
  const s = await setup();
  const { redirect } = await s.buy();
  const token = new URL(redirect!).searchParams.get('license')!;

  s.advance(31 * DAY);
  await s.billing.tick();
  const renewed = s.verify((await s.billing.refresh(token, INSTALL)).token);
  assert.equal(renewed.status, 'active');
  assert.equal(renewed.periodEnd, '2026-12-05T00:00:00.000Z');
  await s.billing.tick();
  assert.equal((await s.db.query<{ n: number }>("SELECT count(*)::int AS n FROM payments WHERE kind = 'renewal.paid'"))[0].n, 1, 'one renewal per period');

  const [license] = await s.billing.licenses('acc_1');
  await s.billing.setCancel('acc_1', license.subscriptionId, true);
  s.advance(31 * DAY);
  await s.billing.tick();
  assert.equal(s.verify((await s.billing.refresh(token, INSTALL)).token).status, 'canceled');
  await assert.rejects(s.billing.setCancel('acc_1', license.subscriptionId, false), /이미 끝난/);
  await s.close();
});
