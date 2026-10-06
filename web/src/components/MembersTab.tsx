import { useState } from 'react';
import { SHARE_ROLES, shareRoleDescription, shareRoleLabel } from '../../../shared/access.ts';
import { GRACE_DAYS, type SubscriptionStatus } from '../../../shared/billing.ts';
import { planHas, planOf, PLANS, type Plan } from '../../../shared/plans.ts';
import { TEAMS } from '../../../shared/teams.ts';
import { formatProductUsd } from '../../../shared/product-currency.ts';
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

const STATUS_LABEL: Record<SubscriptionStatus, string> = { none: '구독 없음', active: '이용 중', past_due: '결제 실패 (유예 중)', canceled: '해지됨' };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ko-KR') : '-');

function PlanSection(props: { snapshot: Snapshot; busy: boolean; run: (work: () => Promise<unknown>, notice: string) => void }) {
  const { snapshot, busy, run } = props;
  const plan = planOf(snapshot.plan);
  const billing = snapshot.billing;
  const connected = Boolean(billing && billing.provider !== 'none');
  const sub = billing?.subscription;

  const site = billing?.site;
  const [key, setKey] = useState('');

  const choose = (target: Plan) => {
    if (target === plan.id && !(connected && sub?.cancelAtPeriodEnd)) return;
    if (!connected) return run(() => api.setPlan(target), `${planOf(target).label} 플랜으로 바꿨어요.`);
    // Site licenses are cancelled and resumed on the site, where the subscription lives.
    if (site && (planOf(target).priceKrw === 0 || (target === sub?.plan && sub.cancelAtPeriodEnd))) {
      window.open(`${site.url}/account`, '_blank', 'noopener');
      return;
    }
    if (planOf(target).priceKrw === 0) {
      if (!window.confirm('구독을 해지할까요? 이번 결제 기간이 끝날 때까지는 지금 플랜을 그대로 써요.')) return;
      return run(() => api.cancelSubscription(), '구독 해지를 예약했어요.');
    }
    if (target === sub?.plan && sub.cancelAtPeriodEnd) return run(() => api.resumeSubscription(), '해지 예약을 취소했어요.');
    return run(async () => {
      const { url } = await api.startCheckout(target);
      window.location.assign(url);
    }, '결제 화면으로 이동해요.');
  };

  return (
    <section className="pixel-box section">
      <h3>플랜</h3>
      <div className="plan-row">
        {PLANS.map((p) => (
          <button key={p.id} className={`plan-option ${p.id === plan.id ? 'selected' : ''}`} disabled={busy} onClick={() => choose(p.id)}>
            <span className="plan-emoji">{p.emoji}</span>
            <b>{p.label}</b>
            <span className="small muted">{p.description}</span>
            <span className="small">
              {p.priceKrw ? `월 ${formatProductUsd(p.priceKrw)}` : '무료'} · {p.maxMembers ? `구성원 ${p.maxMembers}명까지` : '구성원 없음'}
            </span>
            {connected && p.id !== plan.id && <span className="small plan-action">{p.priceKrw ? '결제하고 바꾸기' : '구독 해지'}</span>}
            {connected && p.id === plan.id && sub?.cancelAtPeriodEnd && p.priceKrw > 0 && <span className="small plan-action">해지 취소</span>}
          </button>
        ))}
      </div>
      {!connected ? (
        <p className="muted small">결제가 아직 연결되지 않아 플랜을 바로 바꿀 수 있어요. 결제사를 연결하면(BILLING_PROVIDER) 이 화면에서 결제와 해지를 하게 돼요. 플랜을 낮춰도 계정과 대화는 지워지지 않아요.</p>
      ) : (
        <div className="billing-box">
          <div className="row wrap small">
            <span>결제사: {billing!.providerLabel}</span>
            <span>상태: {STATUS_LABEL[sub!.status]}</span>
            {sub!.currentPeriodEnd && (
              <span>
                {sub!.cancelAtPeriodEnd ? '이용 종료일' : '다음 결제일'}: {day(sub!.currentPeriodEnd)}
              </span>
            )}
          </div>
          {sub!.status === 'past_due' && <p className="neg small">결제가 실패했어요. {GRACE_DAYS}일 안에 결제되지 않으면 개인 플랜으로 바뀌어요. 플랜을 다시 결제해 주세요.</p>}
          {site && (
            <div className="site-license small">
              <p>
                플랜은{' '}
                <a href={`${site.url}/account`} target="_blank" rel="noopener">
                  공식 사이트
                </a>
                에서 사고 관리해요. 결제가 끝나면 이 화면으로 돌아와 바로 적용되고, 기간이 끝나기 전에 앱이 알아서 갱신해요.
              </p>
              <p>
                이 설치의 ID: <code>{site.installId}</code>{' '}
                <button className="pixel-btn small" onClick={() => void navigator.clipboard.writeText(site.installId)}>
                  복사
                </button>
                <span className="muted"> (라이선스를 다른 컴퓨터에서 옮겨 올 때 사이트에 붙여 넣어요)</span>
              </p>
              <div className="row">
                <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="라이선스 키 붙여 넣기" style={{ flex: 1, minWidth: 220 }} />
                <button
                  className="pixel-btn small primary"
                  disabled={busy || !key.trim()}
                  onClick={() =>
                    run(async () => {
                      await api.applyLicense(key.trim());
                      setKey('');
                    }, '라이선스를 적용했어요.')
                  }
                >
                  적용
                </button>
              </div>
            </div>
          )}
          {billing!.invoices.length > 0 && (
            <table className="table small">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>플랜</th>
                  <th className="num">금액</th>
                  <th>결과</th>
                </tr>
              </thead>
              <tbody>
                {billing!.invoices.slice(0, 12).map((inv) => (
                  <tr key={inv.id}>
                    <td>{day(inv.at)}</td>
                    <td>{planOf(inv.plan).label}</td>
                    <td className="num">{formatProductUsd(inv.amountKrw)}</td>
                    <td className={inv.status === 'paid' ? 'pos' : 'neg'}>{inv.status === 'paid' ? '결제됨' : '실패'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

function ActivityExport() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const href = (format: 'csv' | 'json') => `/api/activity/export?${new URLSearchParams({ from, to, format })}`;
  return (
    <section className="pixel-box section">
      <h3>활동 기록 내보내기</h3>
      <p className="muted small">업무 등록, 단계 진행, 승인, AI 비용, 규칙 변경 같은 모든 활동을 기간별로 받아요. 날짜는 UTC 기준이에요.</p>
      <div className="row wrap">
        <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <span>~</span>
        <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
        <a className="pixel-btn small" href={href('csv')} download>
          CSV (엑셀)
        </a>
        <a className="pixel-btn small" href={href('json')} download>
          JSON
        </a>
      </div>
    </section>
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
      <PlanSection snapshot={snapshot} busy={busy} run={run} />
      {planHas(snapshot.plan, 'activityExport') && <ActivityExport />}

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
                    {shareRoleLabel(r)}
                  </option>
                ))}
              </select>
              <OfficePicker snapshot={snapshot} value={form.officeIds} onChange={(officeIds) => setForm({ ...form, officeIds })} />
              <div className="muted small">{shareRoleDescription(form.role)}</div>
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
