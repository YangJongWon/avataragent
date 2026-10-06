import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const { newLicenseKeys, signLicense } = await import('../server/license-crypto.ts');
const keys = newLicenseKeys();

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-billing-site-'));
process.env.AI_PROVIDER = 'mock';
process.env.BILLING_PROVIDER = 'site';
process.env.SITE_URL = 'https://site.test';
process.env.LICENSE_PUBLIC_KEYS = JSON.stringify({ test: keys.publicKey });

const { store } = await import('../server/store.ts');
const billing = await import('../server/billing.ts');
const { installId, savedLicense } = await import('../server/license.ts');

const DAY = 86_400_000;
const sub = () => store.data.billing.subscription;
const license = (patch: Record<string, unknown> = {}) =>
  signLicense(
    {
      v: 1,
      kid: 'test',
      lic: 'lic_teamlicense01',
      account: 'acc_1',
      plan: 'team',
      seats: 10,
      install: installId(),
      periodEnd: new Date(Date.now() + 30 * DAY).toISOString(),
      issuedAt: new Date().toISOString(),
      status: 'active',
      ...patch,
    } as never,
    keys.privateKey,
  );

/** Answers the install's refresh call like the site would. */
function siteAnswers(answer: () => Response) {
  const calls: unknown[] = [];
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)));
    return answer();
  }) as typeof fetch;
  return calls;
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

test('checkout sends the owner to the site with this install and a way back', async () => {
  const { url } = await billing.startCheckout('team', 'http://192.168.0.5:8787/billing/return');
  const target = new URL(url);
  assert.equal(target.origin + target.pathname, 'https://site.test/checkout');
  assert.equal(target.searchParams.get('plan'), 'team');
  assert.equal(target.searchParams.get('install'), installId());
  assert.equal(target.searchParams.get('return'), 'http://192.168.0.5:8787/billing/return');
  assert.match(target.searchParams.get('ref')!, /^chk_/);
  assert.deepEqual(billing.billingInfo().site, { url: 'https://site.test', installId: installId() });
  assert.equal(store.data.plan, 'personal', 'nothing changes before the license comes back');
});

test('the license from the site switches the plan; forged or foreign ones do not', async () => {
  await assert.rejects(billing.applyLicense(license({ install: 'ins_someoneelsesinstall99' })), /다른 설치용/);
  const forged = signLicense(JSON.parse(Buffer.from(license().split('.')[0], 'base64url').toString()), newLicenseKeys().privateKey);
  await assert.rejects(billing.applyLicense(forged), /서명이 맞지 않아요/);
  await assert.rejects(billing.applyLicense(license({ status: 'canceled' })), /해지된 라이선스/);
  assert.equal(store.data.plan, 'personal');

  const ref = store.data.billing.checkouts[0].id;
  await billing.applyLicense(license(), ref);
  assert.equal(store.data.plan, 'team');
  assert.equal(sub().subscriptionId, 'lic_teamlicense01');
  assert.equal(sub().status, 'active');
  assert.equal(store.data.billing.checkouts.find((c) => c.id === ref)?.status, 'completed');
  assert.equal(store.data.billing.invoices[0].amountKrw, 9_000);
  assert.ok(savedLicense());
  await assert.rejects(billing.cancelSubscription(), /사이트의 내 계정/);
});

test('near the end of a period the install fetches a renewed license from the site', async () => {
  const end = Date.parse(sub().currentPeriodEnd!);
  const renewedEnd = new Date(end + 30 * DAY).toISOString();
  const calls = siteAnswers(() => json({ token: license({ periodEnd: renewedEnd }) }));
  billing.siteSync.last = 0;
  await billing.billingTick(new Date(end - 10 * DAY));
  assert.equal(calls.length, 0, 'not due yet');
  await billing.billingTick(new Date(end - 2 * DAY));
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0] as object).sort(), ['install', 'token']);
  assert.equal(sub().currentPeriodEnd, renewedEnd);
  assert.equal(store.data.plan, 'team');
  await billing.billingTick(new Date(end - 2 * DAY + 3_600_000));
  assert.equal(calls.length, 1, 'asked at most every few hours');
});

test('an unreachable site past the period starts the grace period, then the plan drops', async () => {
  const end = Date.parse(sub().currentPeriodEnd!);
  siteAnswers(() => {
    throw new Error('offline');
  });
  billing.siteSync.last = 0;
  await billing.billingTick(new Date(end + DAY));
  assert.equal(sub().status, 'past_due');
  assert.equal(store.data.plan, 'team', 'still usable during the grace period');
  await billing.billingTick(new Date(end + 8 * DAY + 7 * 3_600_000));
  assert.equal(store.data.plan, 'personal');
});

test('a pasted key brings the plan back, and a license the site refuses ends it', async () => {
  await billing.applyLicense(license({ lic: 'lic_businesslic02', plan: 'business', seats: 50 }));
  assert.equal(store.data.plan, 'business', 'a pasted key works without a checkout');
  const end = Date.parse(sub().currentPeriodEnd!);
  siteAnswers(() => json({ error: '다른 설치로 옮겨진 라이선스예요.' }, 409));
  billing.siteSync.last = 0;
  await billing.billingTick(new Date(end - DAY));
  assert.equal(store.data.plan, 'personal');
  assert.equal(sub().status, 'canceled');
});
