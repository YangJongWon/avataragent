import { useState } from 'react';
import { SHARE_ROLES } from '../../../shared/access.ts';
import { planOf, PLANS } from '../../../shared/plans.ts';
import { TEAMS } from '../../../shared/teams.ts';
import type { Member, ShareRole, Snapshot } from '../../../shared/types.ts';
import { api } from '../api.ts';

const MIN_PASSWORD = 8;
const ROLE_IDS = Object.keys(SHARE_ROLES) as ShareRole[];

function OfficePicker(props: { snapshot: Snapshot; value: string[] | 'all'; onChange: (v: string[] | 'all') => void }) {
  const { value } = props;
  return (
    <div className="row wrap small">
      <label>
        <input type="checkbox" checked={value === 'all'} onChange={(e) => props.onChange(e.target.checked ? 'all' : [])} /> 전체 사무실
      </label>
      {value !== 'all' &&
        props.snapshot.offices.map((o) => (
          <label key={o.id}>
            <input
              type="checkbox"
              checked={value.includes(o.id)}
              onChange={(e) => props.onChange(e.target.checked ? [...value, o.id] : value.filter((id) => id !== o.id))}
            />{' '}
            {TEAMS[o.team].emoji} {o.name}
          </label>
        ))}
    </div>
  );
}

function MemberRow(props: { snapshot: Snapshot; member: Member; run: (work: () => Promise<unknown>, notice: string) => void }) {
  const { member, run } = props;
  const [password, setPassword] = useState('');
  const scope = member.officeIds === 'all' ? '전체 사무실' : member.officeIds.map((id) => props.snapshot.offices.find((o) => o.id === id)?.name ?? id).join(', ');
  return (
    <li className={`member-row ${member.disabled ? 'disabled' : ''}`}>
      <div>
        <b>{member.name}</b> <span className="muted small">@{member.loginId}</span>
        <div className="small muted">
          {scope} · 마지막 로그인 {member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString('ko-KR') : '없음'}
          {member.disabled && ' · 사용 중지'}
        </div>
      </div>
      <select value={member.role} onChange={(e) => run(() => api.updateMember(member.id, { role: e.target.value as ShareRole }), '권한을 바꿨어요.')}>
        {ROLE_IDS.map((r) => (
          <option key={r} value={r}>
            {SHARE_ROLES[r].label}
          </option>
        ))}
      </select>
      <input type="password" value={password} placeholder="새 비밀번호" onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      <button
        className="pixel-btn small"
        disabled={password.length < MIN_PASSWORD}
        onClick={() => run(() => api.updateMember(member.id, { password }).then(() => setPassword('')), '비밀번호를 바꿨어요. 기존 로그인은 끊겼어요.')}
      >
        비밀번호 변경
      </button>
      <button
        className="pixel-btn small"
        onClick={() => run(() => api.updateMember(member.id, { disabled: !member.disabled }), member.disabled ? '다시 쓸 수 있게 했어요.' : '사용을 멈췄어요.')}
      >
        {member.disabled ? '다시 사용' : '사용 중지'}
      </button>
      <button
        className="pixel-btn small danger"
        onClick={() => window.confirm(`${member.name} 계정을 지울까요?`) && run(() => api.deleteMember(member.id), '계정을 지웠어요.')}
      >
        삭제
      </button>
    </li>
  );
}

export function MembersTab(props: { snapshot: Snapshot; onError: (m: string) => void; onNotice: (m: string) => void }) {
  const { snapshot } = props;
  const plan = planOf(snapshot.plan);
  const members = snapshot.members ?? [];
  const [form, setForm] = useState({ loginId: '', name: '', password: '', role: 'operator' as ShareRole, officeIds: 'all' as string[] | 'all' });
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<unknown>, notice: string) => {
    setBusy(true);
    try {
      await work();
      props.onNotice(notice);
    } catch (e) {
      props.onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h2>플랜·구성원</h2>
      <section className="pixel-box section">
        <h3>플랜</h3>
        <div className="plan-row">
          {PLANS.map((p) => (
            <button
              key={p.id}
              className={`plan-option ${p.id === plan.id ? 'selected' : ''}`}
              disabled={busy}
              onClick={() => p.id !== plan.id && run(() => api.setPlan(p.id), `${p.label} 플랜으로 바꿨어요.`)}
            >
              <span className="plan-emoji">{p.emoji}</span>
              <b>{p.label}</b>
              <span className="small muted">{p.description}</span>
              <span className="small">{p.maxMembers ? `구성원 ${p.maxMembers}명까지` : '구성원 없음'}</span>
            </button>
          ))}
        </div>
        <p className="muted small">지금은 기능을 켜고 끄는 설정이에요. 결제는 아직 연결되지 않았어요. 플랜을 낮춰도 계정과 대화는 지워지지 않고, 다시 올리면 그대로 쓸 수 있어요.</p>
      </section>

      <section className="pixel-box section">
        <h3>
          구성원 계정 ({members.length}/{plan.maxMembers})
        </h3>
        {plan.maxMembers === 0 ? (
          <p className="muted small">개인 플랜에서는 구성원 계정을 쓸 수 없어요. 팀이나 비즈니스 플랜을 골라 주세요.</p>
        ) : (
          <>
            <p className="muted small">
              구성원은 로그인 화면에서 아이디와 비밀번호로 들어와요. 권한과 볼 수 있는 사무실은 공유 링크와 같은 방식이에요. 접속 비밀번호(ACCESS_PASSWORD)가 켜져 있어야 로그인할 수 있어요.
            </p>
            <div className="member-form">
              <input placeholder="아이디 (영문 소문자·숫자)" value={form.loginId} onChange={(e) => setForm({ ...form, loginId: e.target.value })} autoComplete="off" />
              <input placeholder="이름" value={form.name} maxLength={20} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input
                type="password"
                placeholder={`첫 비밀번호 (${MIN_PASSWORD}자 이상)`}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
              />
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as ShareRole })}>
                {ROLE_IDS.map((r) => (
                  <option key={r} value={r}>
                    {SHARE_ROLES[r].label}
                  </option>
                ))}
              </select>
              <OfficePicker snapshot={snapshot} value={form.officeIds} onChange={(officeIds) => setForm({ ...form, officeIds })} />
              <div className="muted small">{SHARE_ROLES[form.role].description}</div>
              <button
                className="pixel-btn primary"
                disabled={busy || !form.loginId || form.password.length < MIN_PASSWORD || members.length >= plan.maxMembers}
                onClick={() =>
                  run(
                    () => api.createMember(form).then(() => setForm({ ...form, loginId: '', name: '', password: '' })),
                    '계정을 만들었어요. 아이디와 첫 비밀번호를 직접 전달해 주세요.',
                  )
                }
              >
                계정 만들기
              </button>
            </div>
          </>
        )}
        {members.length > 0 && (
          <ul className="member-list">
            {members.map((m) => (
              <MemberRow key={m.id} snapshot={snapshot} member={m} run={run} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
