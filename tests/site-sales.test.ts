import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { strToU8, zipSync } from 'fflate';

const { migrate, openDb } = await import('../site/server/db.ts');
const { Community } = await import('../site/server/community.ts');
const { SiteBilling, licenseKey } = await import('../site/server/billing.ts');
const { Sales, feeOf } = await import('../site/server/sales.ts');
const { Moderation } = await import('../site/server/moderation.ts');
const { Forum } = await import('../site/server/forum.ts');
const { mockOutcome, mockPayments } = await import('../site/server/payments.ts');
const { memoryStorage } = await import('../site/server/storage.ts');
const { flowFromPlan } = await import('../shared/flow-pack.ts');
import type { Account } from '../site/server/auth.ts';
import type { Agent } from '../shared/types.ts';

/** Each test's in-memory database is closed when it ends; PGlite instances are large. */
const openDbs: { close(): Promise<void> }[] = [];
afterEach(async () => {
  while (openDbs.length) await openDbs.pop()!.close().catch(() => {});
});


function png(w: number, h: number) {
  const bytes = new Uint8Array(33);
  const view = new DataView(bytes.buffer);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  view.setUint32(8, 13);
  bytes.set(strToU8('IHDR'), 12);
  view.setUint32(16, w);
  view.setUint32(20, h);
  return bytes;
}

const theme = zipSync({
  'theme.json': strToU8(
    JSON.stringify({
      format: 'avataragent-theme',
      version: 1,
      id: 'premium-cafe',
      themeVersion: '1.0.0',
      name: '프리미엄 카페',
      license: 'Proprietary',
      preview: 'preview.png',
      scene: { layers: [{ image: 'room.png', x: 0, y: 0 }] },
      characters: [{ id: 'yuri', sheet: 'yuri.png', frames: { a: { x: 0, y: 0, w: 64, h: 96 } }, states: { idle: { frames: ['a'] } } }],
    }),
  ),
  'preview.png': png(4, 4),
  'room.png': png(800, 480),
  'yuri.png': png(64, 96),
});

const flow = strToU8(
  JSON.stringify(
    flowFromPlan(
      [
        { kind: 'brief', label: '접수', agentId: 'm', instructions: '', loop: null },
        { kind: 'draft', label: '작성', agentId: 'w', instructions: '', loop: null },
        { kind: 'approval', label: '승인', agentId: null, instructions: '', loop: null },
      ],
      [{ id: 'm', role: 'manager' }, { id: 'w', role: 'writer' }] as Agent[],
      { name: '흐름' },
    ),
  ),
);

async function setup() {
  const db = await openDb();
  openDbs.push(db);
  await migrate(db);
  const people: Record<string, Account> = {};
  for (const [id, role] of [['maker', 'user'], ['buyer', 'user'], ['other', 'user'], ['boss', 'admin']] as const) {
    await db.query('INSERT INTO accounts (id, email, name, role) VALUES ($1, $2, $1, $3)', [id, `${id}@example.com`, role]);
    await db.query('INSERT INTO profiles (account_id, handle) VALUES ($1, $1)', [id]);
    people[id] = { id, email: `${id}@example.com`, name: id, avatar_url: '', role, status: 'active' };
  }
  const now = () => new Date('2026-10-05T00:00:00Z');
  const community = new Community(db, memoryStorage(), now);
  const billing = new SiteBilling(db, mockPayments, licenseKey(null, ''), 'http://site.test', now);
  const sales = new Sales(db, mockPayments, 'http://site.test', now);
  const moderation = new Moderation(db, new Forum(db, now), now);
  const item = (await community.upload(people.maker, { type: 'theme', bytes: theme })).id;
  const buy = async (who: Account) => {
    const { url } = await sales.startCheckout(who, item);
    const checkoutId = url.split('/').pop()!;
    return { checkoutId, ...(await billing.handle(mockOutcome(checkoutId, true))) };
  };
  return { db, people, community, billing, sales, moderation, item, buy };
}

test('creators price only themes, within the allowed range', async () => {
  const s = await setup();
  const f = (await s.community.upload(s.people.maker, { type: 'flow', bytes: flow })).id;
  await assert.rejects(s.sales.setPrice(s.people.maker, f, 3000), /테마만/);
  await assert.rejects(s.sales.setPrice(s.people.maker, s.item, 999), /1,000~100,000/);
  await assert.rejects(s.sales.setPrice(s.people.maker, s.item, 3050), /100원 단위/);
  await assert.rejects(s.sales.setPrice(s.people.buyer, s.item, 3000), /없는 항목/);
  assert.deepEqual(await s.sales.setPrice(s.people.maker, s.item, 4900), { priceKrw: 4900 });
  assert.equal((await s.community.detail(s.item, null)).priceKrw, 4900);
  await assert.rejects(s.sales.startCheckout(s.people.buyer, f), /무료 항목/);
});

test('buying unlocks the download for the buyer, splits the money 70/30 and cannot happen twice', async () => {
  const s = await setup();
  await s.sales.setPrice(s.people.maker, s.item, 4900);
  await assert.rejects(s.community.download(s.item, null), /유료 테마/);
  await assert.rejects(s.community.download(s.item, s.people.buyer), /유료 테마/);
  assert.equal((await s.community.detail(s.item, s.people.buyer)).owned, false);
  assert.ok(await s.community.download(s.item, s.people.maker), 'the creator can always download');
  await assert.rejects(s.sales.startCheckout(s.people.maker, s.item), /내 항목/);

  const { checkoutId, redirect } = await s.buy(s.people.buyer);
  assert.equal(redirect, `http://site.test/community/items/${s.item}?bought=1`);
  const view = await s.billing.checkout('buyer', checkoutId);
  assert.equal(view.kind, 'item');
  assert.equal(view.itemTitle, '프리미엄 카페');
  assert.equal((await s.community.detail(s.item, s.people.buyer)).owned, true);
  assert.ok(await s.community.download(s.item, s.people.buyer));
  await assert.rejects(s.community.download(s.item, s.people.other), /유료 테마/);
  await assert.rejects(s.sales.startCheckout(s.people.buyer, s.item), /이미 산/);

  const earnings = await s.sales.earnings(s.people.maker);
  assert.equal(feeOf(4900), 1470);
  assert.deepEqual([earnings.balance, earnings.gross, earnings.fees, earnings.sales], [3430, 4900, 1470, 1]);
  assert.deepEqual((await s.sales.purchases(s.people.buyer)).map((p) => [p.title, p.amountKrw, p.available]), [['프리미엄 카페', 4900, true]]);
  await assert.rejects(s.sales.balances(s.people.maker), /운영자만/);
  assert.deepEqual((await s.sales.balances(s.people.boss)).map((b) => [b.handle, b.balance, b.gross]), [['maker', 3430, 4900]]);
});

test('refunds reverse both shares and take the download away; payouts never go below zero', async () => {
  const s = await setup();
  await s.sales.setPrice(s.people.maker, s.item, 10000);
  await s.buy(s.people.buyer);
  await s.buy(s.people.other);
  assert.equal((await s.sales.earnings(s.people.maker)).balance, 14000);

  const [sale] = (await s.sales.sales(s.people.boss)).filter((x) => x.buyer === 'buyer@example.com');
  await assert.rejects(s.sales.refund(s.people.boss, sale.id, ''), /이유/);
  await s.sales.refund(s.people.boss, sale.id, '중복 결제');
  await assert.rejects(s.sales.refund(s.people.boss, sale.id, '다시'), /이미 환불/);
  await assert.rejects(s.community.download(s.item, s.people.buyer), /유료 테마/);
  assert.equal((await s.sales.purchases(s.people.buyer))[0].available, false);
  const after = await s.sales.earnings(s.people.maker);
  assert.deepEqual([after.balance, after.refunds, after.fees], [7000, 10000, 3000]);

  await assert.rejects(s.sales.payout(s.people.boss, 'maker', 8000, ''), /남은 금액\(7,000원\)/);
  await assert.rejects(s.sales.payout(s.people.boss, 'maker', -5, ''), /원 단위/);
  assert.deepEqual(await s.sales.payout(s.people.boss, 'maker', 7000, '10월 정산 계좌이체'), { balance: 0 });
  const final = await s.sales.earnings(s.people.maker);
  assert.deepEqual([final.balance, final.payouts], [0, 7000]);
  assert.equal(final.entries[0].kind, 'payout');
  assert.deepEqual((await s.moderation.log(s.people.boss)).map((l) => l.action), ['ledger.payout', 'purchase.refund']);

  // The buyer can buy again after a refund.
  await s.buy(s.people.buyer);
  assert.ok(await s.community.download(s.item, s.people.buyer));
});

test('a repeated payment event records the sale once', async () => {
  const s = await setup();
  await s.sales.setPrice(s.people.maker, s.item, 2000);
  const { url } = await s.sales.startCheckout(s.people.buyer, s.item);
  const event = mockOutcome(url.split('/').pop()!, true);
  await s.billing.handle(event);
  assert.deepEqual(await s.billing.handle(event), { redirect: null });
  assert.deepEqual(await s.db.query('SELECT count(*)::int AS n FROM purchases'), [{ n: 1 }]);
  assert.deepEqual(await s.db.query("SELECT count(*)::int AS n FROM ledger WHERE kind = 'sale'"), [{ n: 1 }]);
});
