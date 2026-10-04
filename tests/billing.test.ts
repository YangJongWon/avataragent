import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-billing-'));
process.env.AI_PROVIDER = 'mock';
process.env.ACCESS_PASSWORD = 'owner-secret';
process.env.BILLING_PROVIDER = 'mock';

const { store } = await import('../server/store.ts');
const billing = await import('../server/billing.ts');
const { setAssignee } = await import('../server/chat.ts');
const { createMember } = await import('../server/members.ts');
const { exportActivity } = await import('../server/activity.ts');
const { snapshotFor } = await import('../server/access.ts');
const { recordTask } = await import('../server/orchestrator.ts');

const DAY = 86_400_000;
const sub = () => store.data.billing.subscription;
const setPlan = (plan: 'personal' | 'team' | 'business') =>
  store.mutate((s) => {
    s.plan = plan;
  });
const checkoutId = (url: string) => url.split('/').at(-1)!;

test('mock checkout pays through the signed webhook, renews, and cancels at period end', async () => {
  assert.equal(store.data.plan, 'personal');
  const { url } = await billing.startCheckout('team');
  assert.match(url, /^\/billing\/mock-checkout\/chk_/);
  assert.equal(store.data.plan, 'personal', 'starting a checkout changes nothing yet');

  await billing.completeMockCheckout(checkoutId(url), 'pay');
  assert.equal(store.data.plan, 'team');
  assert.equal(sub().status, 'active');
  assert.equal(store.data.billing.invoices[0].amountKrw, 29_000);
  await assert.rejects(billing.completeMockCheckout(checkoutId(url), 'pay'), /끝났거나 없는 결제/);
  await assert.rejects(billing.startCheckout('team'), /이미 이 플랜/);

  const end = Date.parse(sub().currentPeriodEnd!);
  await billing.billingTick(new Date(end + 1000));
  assert.equal(store.data.billing.invoices.length, 2, 'the mock renews when the period ends');
  assert.ok(Date.parse(sub().currentPeriodEnd!) > end);

  await billing.cancelSubscription();
  assert.equal(sub().cancelAtPeriodEnd, true);
  await billing.billingTick(new Date());
  assert.equal(store.data.plan, 'team', 'paid time keeps working');
  await billing.resumeSubscription();
  await billing.cancelSubscription();
  await billing.billingTick(new Date(Date.parse(sub().currentPeriodEnd!) + 1000));
  assert.equal(store.data.plan, 'personal');
  assert.equal(sub().status, 'canceled');
});

test('webhooks need a valid signature and each event applies once', async () => {
  const { url } = await billing.startCheckout('business');
  const event = { id: 'evt_once', kind: 'checkout.completed', checkoutId: checkoutId(url), customerId: 'cus_1', subscriptionId: 'sub_1', periodEnd: new Date(Date.now() + 30 * DAY).toISOString() };
  const raw = JSON.stringify(event);
  await assert.rejects(billing.handleWebhook('mock', raw, { [billing.MOCK_SIGNATURE_HEADER]: 'bad' }), /서명/);
  await assert.rejects(billing.handleWebhook('stripe', raw, {}), /연결되지 않은 결제사/);
  assert.equal(store.data.plan, 'personal');

  const headers = { [billing.MOCK_SIGNATURE_HEADER]: billing.signMock(raw) };
  await billing.handleWebhook('mock', raw, headers);
  assert.equal(store.data.plan, 'business');
  const invoices = store.data.billing.invoices.length;

  const renewal = JSON.stringify({ id: 'evt_renew', kind: 'payment.succeeded', subscriptionId: 'sub_1', amountKrw: 99_000, periodEnd: new Date(Date.now() + 60 * DAY).toISOString() });
  await billing.handleWebhook('mock', renewal, { [billing.MOCK_SIGNATURE_HEADER]: billing.signMock(renewal) });
  await billing.handleWebhook('mock', renewal, { [billing.MOCK_SIGNATURE_HEADER]: billing.signMock(renewal) });
  assert.equal(store.data.billing.invoices.length, invoices + 1, 'a repeated delivery is ignored');

  const stranger = JSON.stringify({ id: 'evt_other', kind: 'subscription.canceled', subscriptionId: 'sub_other' });
  await billing.handleWebhook('mock', stranger, { [billing.MOCK_SIGNATURE_HEADER]: billing.signMock(stranger) });
  assert.equal(store.data.plan, 'business', 'events for another subscription are ignored');
});

test('a failed payment keeps the plan through the grace period, then drops to personal', async () => {
  assert.equal(store.data.plan, 'business');
  await billing.applyBillingEvent({ id: 'evt_fail', kind: 'payment.failed', subscriptionId: sub().subscriptionId! });
  assert.equal(sub().status, 'past_due');
  assert.equal(store.data.billing.invoices[0].status, 'failed');
  const end = Date.parse(sub().currentPeriodEnd!);
  await billing.billingTick(new Date(end + DAY));
  assert.equal(store.data.plan, 'business');
  await billing.billingTick(new Date(end + 8 * DAY));
  assert.equal(store.data.plan, 'personal');
  assert.equal(snapshotFor({ kind: 'owner' }).billing?.provider, 'mock');
});

test('business plan assigns tasks to people who can see the office and exports activity', async () => {
  const task = recordTask({ officeId: 'office_dev', title: '담당자 업무, "따옴표"' });
  assert.throws(() => setAssignee(task.id, 'owner'), /비즈니스 플랜/);
  await assert.rejects(exportActivity('2020-01-01', '2099-12-31', 'csv'), /비즈니스 플랜/);

  setPlan('business');
  const hr = createMember({ loginId: 'hrpark', name: '박인사', password: 'password1', role: 'operator', officeIds: ['office_hr'] });
  const dev = createMember({ loginId: 'devchoi', name: '최개발', password: 'password1', role: 'operator', officeIds: ['office_dev'] });
  assert.throws(() => setAssignee(task.id, hr.id), /볼 수 없어요/);
  assert.throws(() => setAssignee(task.id, 'nobody'), /정할 수 없는/);
  assert.equal(setAssignee(task.id, dev.id).assigneeId, dev.id);
  const devViewer = { kind: 'member', memberId: dev.id, name: dev.name, role: 'operator', officeIds: ['office_dev'] } as const;
  assert.deepEqual(snapshotFor(devViewer).people.map((p) => p.id).sort(), [dev.id, 'owner'].sort(), 'members only see people sharing an office');

  const today = new Date().toISOString().slice(0, 10);
  await assert.rejects(exportActivity(today, '2000-01-01', 'csv'), /늦어요/);
  const csv = await exportActivity(today, today, 'csv');
  assert.ok(csv.body.startsWith('\uFEFF시각,종류,사무실,업무,담당자,직원,내용'));
  assert.match(csv.body, /task\.assignee_changed/);
  assert.match(csv.body, /"담당자 업무, ""따옴표"""/);
  assert.match(csv.body, /최개발/);

  const json = JSON.parse((await exportActivity(today, today, 'json')).body) as { type: string }[];
  assert.ok(json.some((r) => r.type === 'billing.subscribed'));
  assert.equal((await exportActivity('2000-01-01', '2000-01-02', 'json')).body, '[]');

  setAssignee(task.id, null);
  assert.equal(store.task(task.id).assigneeId, null);
});
