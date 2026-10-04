import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { planOf } from '../shared/plans.ts';
import type { Member, ShareRole } from '../shared/types.ts';
import { config } from './config.ts';
import { store } from './store.ts';

/** Stored only on the server; snapshots carry `Member` without the hash. */
export interface StoredMember extends Member {
  passwordHash: string;
  /** Bumped on password reset, disable and delete so old sessions stop working. */
  sessionVersion: number;
}

export const MIN_PASSWORD = 8;
const ROLES: ShareRole[] = ['viewer', 'operator', 'manager'];
const LOGIN_ID = /^[a-z0-9._@-]{3,40}$/;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url');
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString('base64url')}`;
}

export function checkPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

// Changing ACCESS_PASSWORD invalidates every member session as well.
const sign = (value: string) => createHmac('sha256', `${config.accessPassword}\0member`).update(value).digest('base64url');

export function memberToken(member: StoredMember) {
  const body = `${member.id}.${member.sessionVersion}`;
  return `${body}.${sign(body)}`;
}

export function memberFromToken(token: string): StoredMember | null {
  const [id, version, mac] = token.split('.');
  if (!id || !version || !mac) return null;
  const expected = Buffer.from(sign(`${id}.${version}`));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const member = store.data.members.find((m) => m.id === id);
  return member && usable(member) && String(member.sessionVersion) === version ? member : null;
}

/** A member can sign in only while not disabled and while the plan includes members. */
export const usable = (member: StoredMember) => !member.disabled && planOf(store.data.plan).features.includes('members');

export function findByLogin(loginId: string) {
  return store.data.members.find((m) => m.loginId === loginId.trim().toLowerCase()) ?? null;
}

function scopeOf(officeIds: unknown): Member['officeIds'] {
  if (officeIds === 'all') return 'all';
  if (!Array.isArray(officeIds)) throw new Error('볼 수 있는 사무실을 골라 주세요.');
  const known = new Set(store.data.offices.map((o) => o.id));
  const scope = [...new Set(officeIds.map(String))].filter((id) => known.has(id));
  if (!scope.length) throw new Error('볼 수 있는 사무실을 하나 이상 골라 주세요.');
  return scope;
}

function checkedPassword(password: unknown) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) throw new Error(`비밀번호는 ${MIN_PASSWORD}자 이상이어야 해요.`);
  return password.slice(0, 200);
}

export const publicMember = ({ passwordHash: _hash, sessionVersion: _version, ...member }: StoredMember): Member => member;

export function createMember(body: Record<string, unknown>) {
  const plan = planOf(store.data.plan);
  if (store.data.members.length >= plan.maxMembers) {
    throw new Error(plan.maxMembers ? `${plan.label} 플랜은 구성원을 ${plan.maxMembers}명까지 둘 수 있어요.` : '개인 플랜에서는 구성원을 추가할 수 없어요. 팀이나 비즈니스 플랜을 골라 주세요.');
  }
  const loginId = String(body.loginId ?? '').trim().toLowerCase();
  if (!LOGIN_ID.test(loginId)) throw new Error('아이디는 영문 소문자, 숫자, . _ @ - 로 3~40자여야 해요.');
  if (findByLogin(loginId)) throw new Error('이미 쓰는 아이디예요.');
  if (!ROLES.includes(body.role as ShareRole)) throw new Error('권한을 골라 주세요.');
  const member: StoredMember = {
    id: `member_${randomUUID().slice(0, 8)}`,
    loginId,
    name: String(body.name ?? '').trim().slice(0, 20) || loginId,
    role: body.role as ShareRole,
    officeIds: scopeOf(body.officeIds),
    disabled: false,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    passwordHash: hashPassword(checkedPassword(body.password)),
    sessionVersion: 1,
  };
  store.mutate((s) => {
    s.members.push(member);
  });
  store.emit('member.created', { payload: { memberId: member.id, name: member.name, role: member.role } });
  return publicMember(member);
}

export function updateMember(id: string, body: Record<string, unknown>) {
  const member = store.data.members.find((m) => m.id === id);
  if (!member) throw new Error('없는 구성원이에요.');
  const patch: Partial<StoredMember> = {};
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 20);
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role as ShareRole)) throw new Error('권한을 골라 주세요.');
    patch.role = body.role as ShareRole;
  }
  if (body.officeIds !== undefined) patch.officeIds = scopeOf(body.officeIds);
  if (typeof body.disabled === 'boolean') patch.disabled = body.disabled;
  if (body.password !== undefined) patch.passwordHash = hashPassword(checkedPassword(body.password));
  if (patch.disabled || patch.passwordHash) patch.sessionVersion = member.sessionVersion + 1;
  store.mutate((s) => {
    Object.assign(s.members.find((m) => m.id === id)!, patch);
  });
  store.emit('member.updated', { payload: { memberId: id, name: member.name } });
  return publicMember(store.data.members.find((m) => m.id === id)!);
}

export function deleteMember(id: string) {
  const member = store.data.members.find((m) => m.id === id);
  if (!member) throw new Error('이미 지워진 구성원이에요.');
  store.mutate((s) => {
    s.members = s.members.filter((m) => m.id !== id);
  });
  store.emit('member.removed', { payload: { memberId: id, name: member.name } });
}

export function touchLogin(id: string) {
  store.mutate((s) => {
    const target = s.members.find((m) => m.id === id);
    if (target) target.lastLoginAt = new Date().toISOString();
  });
}
