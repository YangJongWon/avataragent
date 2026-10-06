import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const { newLicenseKeys, signLicense } = await import('../server/license-crypto.ts');
const keys = newLicenseKeys();

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-billing-yearly-'));
process.env.AI_PROVIDER = 'mock';
process.env.BILLING_PROVIDER = 'site';
process.env.SITE_URL = 'https://site.test';
process.env.LICENSE_PUBLIC_KEYS = JSON.stringify({ test: keys.publicKey });

const { store } = await import('../server/store.ts');
const billing = await import('../server/billing.ts');
const { installId } = await import('../server/license.ts');

const DAY = 86_400_000;

test('a plan started monthly in the app but bought yearly on the site is invoiced at the yearly price', async () => {
  await billing.startCheckout('team', 'http://localhost:8787/billing/return');
  const ref = store.data.billing.checkouts[0].id;
  assert.equal(store.data.billing.checkouts[0].amountKrw, 9_000, 'the app starts at the monthly price');
  const token = signLicense(
    {
      v: 1,
      kid: 'test',
      lic: 'lic_yearlylicense01',
      account: 'acc_1',
      plan: 'team',
      seats: 10,
      install: installId(),
      periodEnd: new Date(Date.now() + 365 * DAY).toISOString(),
      issuedAt: new Date().toISOString(),
      status: 'active',
      interval: 'year',
    },
    keys.privateKey,
  );
  await billing.applyLicense(token, ref);
  assert.equal(store.data.plan, 'team');
  assert.equal(store.data.billing.invoices[0].amountKrw, 90_000);
  assert.equal(store.data.billing.checkouts.find((c) => c.id === ref)?.amountKrw, 90_000);
});
