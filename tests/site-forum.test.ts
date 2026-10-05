import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { strToU8 } from 'fflate';

const { migrate, openDb } = await import('../site/server/db.ts');
const { Community } = await import('../site/server/community.ts');
const { Creators } = await import('../site/server/creators.ts');
const { Forum, REPORTS_TO_HIDE } = await import('../site/server/forum.ts');
const { Moderation } = await import('../site/server/moderation.ts');
const { memoryStorage } = await import('../site/server/storage.ts');
const { flowFromPlan } = await import('../shared/flow-pack.ts');
import type { Account } from '../site/server/auth.ts';
import type { Agent } from '../shared/types.ts';

/** Each test's in-memory database is closed when it ends; PGlite instances are large. */
const openDbs: { close(): Promise<void> }[] = [];
afterEach(async () => {
  while (openDbs.length) await openDbs.pop()!.close().catch(() => {});
});


const DAY = 86_400_000;
const flow = (name: string) =>
  strToU8(
    JSON.stringify(
      flowFromPlan(
        [
          { kind: 'brief', label: '접수', agentId: 'm', instructions: '', loop: null },
          { kind: 'draft', label: '작성', agentId: 'w', instructions: '', loop: null },
          { kind: 'approval', label: '승인', agentId: null, instructions: '', loop: null },
        ],
        [{ id: 'm', role: 'manager' }, { id: 'w', role: 'writer' }] as Agent[],
        { name },
      ),
    ),
  );

async function setup() {
  const db = await openDb();
  openDbs.push(db);
  await migrate(db);
  const people: Record<string, Account> = {};
  for (const [id, role] of [['mina', 'user'], ['jun', 'user'], ['ari', 'user'], ['bo', 'user'], ['cy', 'user'], ['boss', 'admin']] as const) {
    await db.query('INSERT INTO accounts (id, email, name, role) VALUES ($1, $2, $1, $3)', [id, `${id}@example.com`, role]);
    await db.query('INSERT INTO profiles (account_id, handle) VALUES ($1, $1)', [id]);
    people[id] = { id, email: `${id}@example.com`, name: id, avatar_url: '', role, status: 'active' };
  }
  let now = new Date('2026-10-05T00:00:00Z');
  const clock = () => now;
  const community = new Community(db, memoryStorage(), clock);
  const forum = new Forum(db, clock);
  return {
    db,
    people,
    community,
    creators: new Creators(db, community, clock),
    forum,
    moderation: new Moderation(db, forum, clock),
    advance: (ms: number) => (now = new Date(now.getTime() + ms)),
  };
}

test('ranking counts recent downloads and likes per creator; profiles show totals and badges', async () => {
  const s = await setup();
  const a = (await s.community.upload(s.people.mina, { type: 'flow', bytes: flow('A') })).id;
  const b = (await s.community.upload(s.people.jun, { type: 'flow', bytes: flow('B') })).id;
  for (let i = 0; i < 4; i++) await s.community.download(b, null);
  s.advance(40 * DAY);
  await s.community.download(a, null);
  await s.community.like(a, s.people.ari, true);
  await s.community.like(a, s.people.bo, true);

  const month = await s.creators.ranking('month');
  assert.deepEqual(month.map((r) => [r.handle, r.score]), [['mina', 7]], 'old downloads fall out of the month');
  const all = await s.creators.ranking('all');
  assert.deepEqual(all.map((r) => [r.handle, r.score]), [['mina', 7], ['jun', 4]]);

  const profile = await s.creators.profile('mina', null);
  assert.equal(profile.totals.items, 1);
  assert.equal(profile.totals.likes, 2);
  assert.equal(profile.monthRank, 1);
  assert.deepEqual(profile.badges.map((x) => x.id), ['first-upload', 'top10']);
  await assert.rejects(s.creators.profile('nobody', null), /없는 사용자/);
});

test('profile edits check the handle, links and length', async () => {
  const s = await setup();
  const updated = await s.creators.update(s.people.mina, { handle: 'Mina_Draws', name: '미나', bio: '테마 만들어요', links: ['https://mina.example/', ''] });
  assert.equal(updated.handle, 'mina_draws');
  assert.equal(updated.name, '미나');
  assert.deepEqual(updated.links, ['https://mina.example/']);
  await assert.rejects(s.creators.update(s.people.jun, { handle: 'mina_draws' }), /이미 다른 사람/);
  await assert.rejects(s.creators.update(s.people.jun, { handle: 'admin' }), /쓸 수 없는/);
  await assert.rejects(s.creators.update(s.people.jun, { handle: 'x' }), /2~24자/);
  await assert.rejects(s.creators.update(s.people.jun, { links: ['javascript:alert(1)'] }), /https/);
  assert.equal((await s.creators.update(s.people.jun, { bio: '가'.repeat(500) })).bio.length, 300);
});

test('questions get answers, the asker accepts one, and accepted answers earn a badge', async () => {
  const s = await setup();
  await assert.rejects(s.forum.create(s.people.mina, { category: 'notice', title: '공지', body: '...' }), /운영자만/);
  await assert.rejects(s.forum.create(s.people.mina, { category: 'question', title: '?', body: '본문' }), /제목/);
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const { id } = await s.forum.create(s.people.mina, { category: 'question', title: `테마가 안 보여요 ${i}`, body: '**설치**했는데 안 보여요' });
    ids.push(id);
    const { id: answer } = await s.forum.comment(s.people.jun, id, '사무실 테마 설정을 확인해 보세요.');
    const { id: own } = await s.forum.comment(s.people.mina, id, '고마워요');
    await assert.rejects(s.forum.accept(s.people.jun, id, answer), /질문한 사람만/);
    await assert.rejects(s.forum.accept(s.people.mina, id, own), /내 댓글/);
    const post = await s.forum.accept(s.people.mina, id, answer);
    assert.equal(post.acceptedCommentId, answer);
    assert.equal(post.comments.find((c) => c.id === answer)!.accepted, true);
  }
  const list = await s.forum.list({ category: 'question' });
  assert.equal(list.total, 3);
  assert.equal(list.posts[0].answered, true);
  assert.equal(list.posts[0].comments, 2);
  assert.equal(list.posts[0].excerpt, '설치했는데 안 보여요');
  assert.equal((await s.forum.list({ q: '안 보여요 1' })).total, 1);
  assert.ok((await s.creators.badges('jun', 'jun')).some((b) => b.id === 'helper'));

  const notice = await s.forum.create(s.people.boss, { category: 'notice', title: '커뮤니티가 열렸어요', body: '반가워요' });
  await s.forum.pin(s.people.boss, notice.id, true);
  assert.equal((await s.forum.list({})).posts[0].id, notice.id, 'pinned posts come first');

  // Removing the accepted answer clears the pick and the count.
  const first = await s.forum.get(ids[0], null);
  await s.forum.removeComment(s.people.jun, first.acceptedCommentId!);
  const after = await s.forum.get(ids[0], null);
  assert.equal(after.acceptedCommentId, null);
  assert.equal(after.comments.length, 1);
  assert.equal((await s.forum.list({ category: 'question' })).posts.find((p) => p.id === ids[0])!.comments, 1);
});

test('reports hide posts and comments into the admin queue; admins restore or remove and it is logged', async () => {
  const s = await setup();
  const { id: post } = await s.forum.create(s.people.mina, { category: 'tip', title: '광고 글', body: '여기서 사세요' });
  const { id: comment } = await s.forum.comment(s.people.jun, post, '스팸 링크');
  const item = (await s.community.upload(s.people.mina, { type: 'flow', bytes: flow('X') })).id;
  await s.community.report(item, s.people.jun, '저작권');

  const reporters = [s.people.ari, s.people.bo, s.people.cy].slice(0, REPORTS_TO_HIDE);
  for (const r of reporters) await s.forum.report(r, 'post', post, '광고');
  for (const r of reporters) await s.forum.report(r, 'comment', comment, '스팸');
  await assert.rejects(s.forum.get(post, null), /없는 글/);
  assert.equal((await s.forum.get(post, s.people.mina)).status, 'hidden', 'the author still sees it');

  await assert.rejects(s.moderation.queue(s.people.mina), /운영자만/);
  const queue = await s.moderation.queue(s.people.boss);
  assert.deepEqual(queue.map((q) => q.type).sort(), ['comment', 'item', 'post']);
  assert.equal(queue.find((q) => q.type === 'post')!.reports.length, REPORTS_TO_HIDE);
  assert.equal(queue.find((q) => q.type === 'comment')!.postId, post);

  await s.moderation.resolve(s.people.boss, 'post', post, 'restore');
  await s.moderation.resolve(s.people.boss, 'comment', comment, 'remove');
  await s.moderation.resolve(s.people.boss, 'item', item, 'restore');
  assert.deepEqual(await s.moderation.queue(s.people.boss), []);
  const visible = await s.forum.get(post, null);
  assert.equal(visible.comments.length, 0);
  assert.deepEqual((await s.moderation.log(s.people.boss)).map((l) => l.action).sort(), ['comment.remove', 'item.restore', 'post.restore']);
});

test('a suspended account is signed out everywhere and cannot write', async () => {
  const s = await setup();
  await s.db.query("INSERT INTO sessions (id_hash, account_id, expires_at) VALUES ('h1', 'mina', '2030-01-01')");
  await assert.rejects(s.moderation.suspend(s.people.boss, 'mina', true, ''), /이유/);
  await assert.rejects(s.moderation.suspend(s.people.boss, 'boss', true, '테스트'), /나 자신/);
  await s.moderation.suspend(s.people.boss, 'mina', true, '광고 반복');
  assert.deepEqual(await s.db.query("SELECT * FROM sessions WHERE account_id = 'mina'"), []);
  const suspended = { ...s.people.mina, status: 'suspended' as const };
  await assert.rejects(s.forum.create(suspended, { category: 'tip', title: '다시 광고', body: '...' }), /막힌 계정/);
  await assert.rejects(s.community.upload(suspended, { type: 'flow', bytes: flow('Y') }), /막힌 계정/);
  await assert.rejects(s.creators.profile('mina', null), /없는 사용자/);
  const users = await s.moderation.users(s.people.boss, 'min');
  assert.deepEqual(users.map((u) => [u.handle, u.status]), [['mina', 'suspended']]);
  await s.moderation.suspend(s.people.boss, 'mina', false, '');
  assert.equal((await s.creators.profile('mina', null)).handle, 'mina');
});
