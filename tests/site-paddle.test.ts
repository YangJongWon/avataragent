import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import test, { afterEach } from 'node:test';

const { paddleEvent, paddlePayments, verifyPaddleSignature } = await import('../site/server/payments-paddle.ts');
const { createSiteApp } = await import('../site/server/app.ts');
const { migrate, openDb } = await import('../site/server/db.ts');
const { memoryStorage } = await import('../site/server/storage.ts');
const { verifyLicense } = await import('../server/license-crypto.ts');
import type { Account } from '../site/server/auth.ts';

const SECRET = 'pdl_ntfset_test_secret';
const NOW = Date.parse('2026-10-05T00:00:00Z');
const config = {
  env: 'sandbox' as const,
  apiKey: 'pdl_sdbx_apikey',
  clientToken: 'test_clienttoken',
  webhookSecret: SECRET,
  prices: { team: { month: 'pri_team', year: 'pri_team_year' }, business: { month: 'pri_business' } },
  currency: 'KRW',
};

const sign = (body: string, ts = Math.floor(NOW / 1000), secret = SECRET) => `ts=${ts};h1=${createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex')}`;

/** A fake Paddle API that records requests and answers a transaction with a checkout link. */
function fakePaddle() {
  const calls: { method: string; url: string; body: Record<string, unknown> | null; auth: string | null }[] = [];
  let n = 0;
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method: init?.method ?? 'GET', url: String(input), body, auth: new Headers(init?.headers).get('authorization') });
    if (String(input).endsWith('/transactions')) {
      n += 1;
      return Response.json({ data: { id: `txn_${n}`, checkout: { url: `http://site.test/checkout/paddle?_ptxn=txn_${n}` } } }, { status: 201 });
    }
    return Response.json({ data: {} });
  }) as typeof fetch;
  return { impl, calls };
}

const openDbs: { close(): Promise<void> }[] = [];
afterEach(async () => {
  while (openDbs.length) await openDbs.pop()!.close().catch(() => {});
});

test('webhook signatures: right secret, untouched body, recent, either of two during rotation', () => {
  const body = '{"event_id":"evt_1"}';
  verifyPaddleSignature(body, sign(body), SECRET, NOW);
  const rotated = `${sign(body, undefined, 'old_secret')};h1=${sign(body).split('h1=')[1]}`;
  verifyPaddleSignature(body, rotated, SECRET, NOW);
  assert.throws(() => verifyPaddleSignature(`${body} `, sign(body), SECRET, NOW), /맞지 않아요/);
  assert.throws(() => verifyPaddleSignature(body, sign(body, undefined, 'wrong'), SECRET, NOW), /맞지 않아요/);
  assert.throws(() => verifyPaddleSignature(body, sign(body, Math.floor(NOW / 1000) - 3600), SECRET, NOW), /오래됐어요/);
  assert.throws(() => verifyPaddleSignature(body, undefined, SECRET, NOW), /서명이 없어요/);
  assert.throws(() => verifyPaddleSignature(body, 'ts=1;h1=zz', SECRET, NOW), /오래됐어요|맞지 않아요/);
});

test('Paddle notifications become the site payment events', () => {
  const txn = (data: Record<string, unknown>, type = 'transaction.completed') => paddleEvent({ event_id: 'evt_x', event_type: type, data });
  assert.deepEqual(txn({ id: 'txn_1', origin: 'web', subscription_id: 'sub_1', custom_data: { checkout_id: 'chk_a' } }), {
    id: 'evt_x',
    kind: 'checkout.paid',
    checkoutId: 'chk_a',
    providerRef: 'sub_1',
  });
  assert.deepEqual(txn({ id: 'txn_2', origin: 'web', custom_data: { checkout_id: 'chk_b' } }), { id: 'evt_x', kind: 'checkout.paid', checkoutId: 'chk_b', providerRef: 'txn_2' }, 'one-off: the transaction is the reference');
  assert.deepEqual(txn({ id: 'txn_3', origin: 'subscription_recurring', subscription_id: 'sub_1', currency_code: 'KRW', details: { totals: { grand_total: '29000' } } }), {
    id: 'evt_x',
    kind: 'renewal.paid',
    providerRef: 'sub_1',
    amountKrw: 29000,
  });
  assert.equal(txn({ id: 'txn_4', origin: 'web', custom_data: { checkout_id: 'chk_c' } }, 'transaction.payment_failed'), null, 'a declined card can be retried');
  assert.deepEqual(txn({ id: 'txn_5', origin: 'subscription_recurring', subscription_id: 'sub_1' }, 'transaction.payment_failed'), { id: 'evt_x', kind: 'renewal.failed', providerRef: 'sub_1' });
  assert.deepEqual(paddleEvent({ event_id: 'e', event_type: 'subscription.canceled', data: { id: 'sub_1' } }), { id: 'e', kind: 'subscription.canceled', providerRef: 'sub_1' });
  assert.deepEqual(paddleEvent({ event_id: 'e', event_type: 'subscription.past_due', data: { id: 'sub_1' } }), { id: 'e', kind: 'renewal.failed', providerRef: 'sub_1' });
  assert.equal(paddleEvent({ event_id: 'e', event_type: 'customer.created', data: {} }), null);
  assert.equal(txn({ id: 'txn_6', origin: 'web' }), null, 'transactions the site did not start are ignored');
});

test('checkouts, cancel, resume and refund call the Paddle API', async () => {
  const fake = fakePaddle();
  const paddle = paddlePayments(config, fake.impl, () => NOW);
  const plan = await paddle.createCheckout({ id: 'chk_plan', kind: 'plan', plan: 'team', amountKrw: 29000, title: '팀 플랜 (월)' }, 'http://site.test');
  assert.equal(plan.url, 'http://site.test/checkout/paddle?_ptxn=txn_1&chk=chk_plan');
  assert.equal(fake.calls[0].url, 'https://sandbox-api.paddle.com/transactions');
  assert.equal(fake.calls[0].auth, 'Bearer pdl_sdbx_apikey');
  assert.deepEqual(fake.calls[0].body, { items: [{ price_id: 'pri_team', quantity: 1 }], custom_data: { checkout_id: 'chk_plan' } });

  await paddle.createCheckout({ id: 'chk_item', kind: 'item', amountKrw: 4900, title: '프리미엄 카페' }, 'http://site.test');
  const item = (fake.calls[1].body!.items as { price: { unit_price: unknown; product: { tax_category: string } } }[])[0];
  assert.deepEqual(item.price.unit_price, { amount: '4900', currency_code: 'KRW' });
  assert.equal(item.price.product.tax_category, 'standard');
  assert.deepEqual((item.price as unknown as { quantity: unknown }).quantity, { minimum: 1, maximum: 1 }, 'one copy per purchase');

  await assert.rejects(paddlePayments({ ...config, prices: {} }, fake.impl).createCheckout({ id: 'c', kind: 'plan', plan: 'business', amountKrw: 1, title: 't' }, ''), /PADDLE_PRICE_BUSINESS/);
  await assert.rejects(paddle.createCheckout({ id: 'c', kind: 'plan', plan: 'business', interval: 'year', amountKrw: 1, title: 't' }, ''), /PADDLE_PRICE_BUSINESS_YEARLY/);
  await paddle.createCheckout({ id: 'chk_year', kind: 'plan', plan: 'team', interval: 'year', amountKrw: 90000, title: '팀 플랜 (연간)' }, 'http://site.test');
  assert.deepEqual(fake.calls.at(-1)!.body!.items, [{ price_id: 'pri_team_year', quantity: 1 }], 'a yearly plan uses its yearly price');
  const noLink = (async () => Response.json({ data: { id: 'txn_9', checkout: { url: null } } })) as unknown as typeof fetch;
  await assert.rejects(paddlePayments(config, noLink).createCheckout({ id: 'c', kind: 'item', amountKrw: 1000, title: 't' }, ''), /기본 결제 링크/);
  const failing = (async () => Response.json({ error: { code: 'forbidden', detail: 'bad key' } }, { status: 403 })) as unknown as typeof fetch;
  await assert.rejects(paddlePayments(config, failing).cancel('sub_1'), /403 forbidden/);

  await paddle.cancel('sub_1');
  await paddle.resume('sub_1');
  await paddle.refund!('txn_2', 4900);
  assert.deepEqual(
    fake.calls.slice(-3).map((c) => [c.method, c.url.replace('https://sandbox-api.paddle.com', ''), c.body]),
    [
      ['POST', '/subscriptions/sub_1/cancel', { effective_from: 'next_billing_period' }],
      ['PATCH', '/subscriptions/sub_1', { scheduled_change: null }],
      ['POST', '/adjustments', { action: 'refund', type: 'full', transaction_id: 'txn_2', reason: '사이트 운영자 환불' }],
    ],
  );
  assert.deepEqual(paddle.browser, { provider: 'paddle', env: 'sandbox', token: 'test_clienttoken' });
});

test('a signed webhook over HTTP issues the license; the browser comes back to the app with it', async () => {
  const db = await openDb();
  openDbs.push(db);
  await migrate(db);
  await db.query("INSERT INTO accounts (id, email, name) VALUES ('acc_1', 'buyer@example.com', 'buyer'), ('maker', 'maker@example.com', 'maker')");
  await db.query("INSERT INTO profiles (account_id, handle) VALUES ('acc_1', 'buyer'), ('maker', 'maker')");
  const fake = fakePaddle();
  const payments = paddlePayments(config, fake.impl, () => Date.now());
  const siteConfig = { port: 0, publicUrl: 'http://site.test', databaseUrl: '', dataDir: '', secret: 's', adminEmails: [], google: null, github: null, mail: { provider: 'console' }, license: null };
  const app = createSiteApp({ db, config: siteConfig as never, mailer: { send: async () => {} }, storage: memoryStorage(), payments });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const webhook = (event: Record<string, unknown>, signature?: string) => {
    const body = JSON.stringify(event);
    return fetch(`${base}/api/payments/webhook/paddle`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'paddle-signature': signature ?? sign(body, Math.floor(Date.now() / 1000)) },
      body,
    });
  };
  try {
    assert.deepEqual(await (await fetch(`${base}/api/payments/config`)).json(), { provider: 'paddle', env: 'sandbox', token: 'test_clienttoken' });

    const { url } = await app.billing.startPlanCheckout('acc_1', { plan: 'team', install: 'ins_abcdefghijklmnop1234', ref: 'chk_app', returnUrl: 'http://192.168.0.5:8787/billing/return' });
    const checkoutId = new URL(url).searchParams.get('chk')!;
    assert.equal((await app.billing.checkout('acc_1', checkoutId)).redirect, null, 'not paid yet');

    const paid = { event_id: 'evt_paid', event_type: 'transaction.completed', data: { id: 'txn_1', origin: 'web', subscription_id: 'sub_77', custom_data: { checkout_id: checkoutId } } };
    assert.equal((await webhook(paid, 'ts=1;h1=00')).status, 400, 'a forged notification is refused');
    const first = await webhook(paid);
    assert.equal(first.status, 200, await first.text());
    assert.equal((await webhook(paid)).status, 200, 'Paddle retries are harmless');

    const view = await app.billing.checkout('acc_1', checkoutId);
    const back = new URL(view.redirect!);
    assert.equal(back.origin + back.pathname, 'http://192.168.0.5:8787/billing/return');
    assert.equal(back.searchParams.get('ref'), 'chk_app');
    const license = verifyLicense(back.searchParams.get('license')!, { [app.billing.publicKey.kid]: app.billing.publicKey.pem });
    assert.equal(license.plan, 'team');
    const [sub] = await db.query<{ provider: string; provider_ref: string; period_end: Date }>('SELECT provider, provider_ref, period_end FROM subscriptions');
    assert.deepEqual([sub.provider, sub.provider_ref], ['paddle', 'sub_77']);

    // Paddle renews by itself and reports it; then a cancel at the period end.
    await webhook({ event_id: 'evt_renew', event_type: 'transaction.completed', data: { id: 'txn_r', origin: 'subscription_recurring', subscription_id: 'sub_77', currency_code: 'KRW', details: { totals: { grand_total: '29000' } } } });
    const [renewed] = await db.query<{ period_end: Date }>('SELECT period_end FROM subscriptions');
    assert.ok(new Date(renewed.period_end) > new Date(sub.period_end));
    await app.billing.setCancel('acc_1', (await db.query<{ id: string }>('SELECT id FROM subscriptions'))[0].id, true);
    assert.equal(fake.calls.at(-1)!.url, 'https://sandbox-api.paddle.com/subscriptions/sub_77/cancel');
    await webhook({ event_id: 'evt_cancel', event_type: 'subscription.canceled', data: { id: 'sub_77' } });
    assert.deepEqual(await db.query('SELECT status FROM subscriptions'), [{ status: 'canceled' }]);

    // A paid theme: the sale lands in the ledger and the browser goes back to the item.
    await db.query(
      "INSERT INTO items (id, type, slug, owner_id, title, license, price_krw) VALUES ('itm_paidtheme1', 'theme', 'paid', 'maker', '유료 테마', 'Proprietary', 4900)",
    );
    await db.query("INSERT INTO item_versions (item_id, version, label, file_key, size, sha256) VALUES ('itm_paidtheme1', 1, '1.0.0', 'k', 1, 'x')");
    const buyer = { id: 'acc_1', email: 'buyer@example.com', name: 'buyer', avatar_url: '', role: 'user', status: 'active' } as Account;
    const itemCheckout = new URL((await app.sales.startCheckout(buyer, 'itm_paidtheme1')).url).searchParams.get('chk')!;
    await webhook({ event_id: 'evt_item', event_type: 'transaction.completed', data: { id: 'txn_item', origin: 'web', custom_data: { checkout_id: itemCheckout } } });
    assert.equal((await app.billing.checkout('acc_1', itemCheckout)).redirect, 'http://site.test/community/items/itm_paidtheme1?bought=1');
    assert.deepEqual(await db.query('SELECT provider, provider_ref FROM purchases'), [{ provider: 'paddle', provider_ref: 'txn_item' }]);
    assert.equal((await app.sales.earnings({ ...buyer, id: 'maker' })).balance, 3430);
  } finally {
    server.close();
  }
});
