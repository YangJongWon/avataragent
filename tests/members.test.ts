import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-members-'));
process.env.AI_PROVIDER = 'mock';
process.env.ACCESS_PASSWORD = 'owner-secret';

const { store } = await import('../server/store.ts');
const { createMember, updateMember, memberToken, publicMember } = await import('../server/members.ts');
const { viewerOf, stillValid } = await import('../server/auth.ts');
const { snapshotFor } = await import('../server/access.ts');
const { chatNews, postChat } = await import('../server/chat.ts');
const { can } = await import('../shared/access.ts');
const { recordTask } = await import('../server/orchestrator.ts');

const request = (cookie: string) => ({ headers: { cookie } }) as IncomingMessage;
const stored = (id: string) => store.data.members.find((m) => m.id === id)!;
const setPlan = (plan: 'personal' | 'team' | 'business') =>
  store.mutate((s) => {
    s.plan = plan;
  });

test('members need a plan with members, sign in with their own session and lose it on password change', () => {
  assert.throws(() => createMember({ loginId: 'kim', password: 'password1', role: 'operator', officeIds: 'all' }), /개인 플랜/);
  setPlan('team');
  const kim = createMember({ loginId: 'Kim', name: '김대리', password: 'password1', role: 'operator', officeIds: ['office_dev'] });
  assert.equal(kim.loginId, 'kim');
  assert.throws(() => createMember({ loginId: 'kim', password: 'password1', role: 'operator', officeIds: 'all' }), /이미 쓰는 아이디/);
  assert.throws(() => createMember({ loginId: 'lee', password: 'short', role: 'operator', officeIds: 'all' }), /8자 이상/);
  assert.ok(!('passwordHash' in publicMember(stored(kim.id))));
  assert.ok(stored(kim.id).passwordHash.startsWith('scrypt$'));

  const cookie = `office_member=${encodeURIComponent(memberToken(stored(kim.id)))}`;
  const viewer = viewerOf(request(cookie));
  assert.equal(viewer?.kind, 'member');
  assert.ok(viewer && can(viewer, 'operate', 'office_dev'));
  assert.ok(viewer && !can(viewer, 'operate', 'office_hr'));
  assert.equal(viewerOf(request('office_member=forged.1.abc')), null);

  const snap = snapshotFor(viewer!);
  assert.equal(snap.members, undefined);
  assert.deepEqual(snap.offices.map((o) => o.id), ['office_dev']);

  updateMember(kim.id, { password: 'password2' });
  assert.equal(viewerOf(request(cookie)), null, 'old session ends after a password change');

  const fresh = `office_member=${encodeURIComponent(memberToken(stored(kim.id)))}`;
  setPlan('personal');
  assert.equal(viewerOf(request(fresh)), null, 'a plan without members blocks sign-in');
  setPlan('team');
  const again = viewerOf(request(fresh))!;
  assert.equal(stillValid(again), true);
  updateMember(kim.id, { role: 'viewer' });
  assert.equal(stillValid(again), false, 'a changed role ends long-lived connections');
});

test('chat follows the plan and office scope, never reaches share links, and posts office news', () => {
  setPlan('team');
  const owner = { kind: 'owner' } as const;
  const lee = createMember({ loginId: 'lee', name: '이과장', password: 'password1', role: 'operator', officeIds: ['office_hr'] });
  const leeViewer = viewerOf(request(`office_member=${encodeURIComponent(memberToken(stored(lee.id)))}`))!;
  const share = { kind: 'share', shareId: 's', name: '링크', role: 'manager', officeIds: 'all' } as const;

  postChat(owner, { channel: 'company', text: '안녕하세요' });
  postChat(leeViewer, { channel: 'company', text: '반가워요' });
  assert.throws(() => postChat(share, { channel: 'company', text: '저도' }), /글을 쓸 수 없어요/);
  assert.throws(() => postChat(owner, { channel: 'office:office_hr', text: '팀 플랜' }), /글을 쓸 수 없어요/);

  const devTask = recordTask({ officeId: 'office_dev', title: '개발 업무' });
  assert.throws(() => postChat(leeViewer, { channel: 'company', text: '', taskId: devTask.id }), /공유할 수 없는 업무/);
  postChat(owner, { channel: 'company', text: '이것 보세요', taskId: devTask.id });
  chatNews({ eventId: 'e', seq: 1, type: 'approval.requested', timestamp: '', projectId: '', taskId: devTask.id, payload: {} });

  const leeChat = snapshotFor(leeViewer).chat;
  assert.deepEqual(leeChat.map((m) => m.text), ['안녕하세요', '반가워요'], 'cards of offices lee cannot see stay hidden');
  assert.equal(snapshotFor(share).chat.length, 0);
  assert.equal(store.data.chat.at(-1)?.author.kind, 'system');

  setPlan('business');
  postChat(leeViewer, { channel: 'office:office_hr', text: '인사팀끼리' });
  assert.throws(() => postChat(leeViewer, { channel: 'office:office_dev', text: '몰래' }), /글을 쓸 수 없어요/);
});
