import { useEffect, useState } from 'react';
import { siteApi, type AdminUser, type AuditEntry, type Me, type QueueEntry } from '../api.ts';
import { ago, errorText } from '../parts.tsx';
import { Link } from '../router.tsx';
import { formatProductUsd, productUnitsFromUsd, productUsdFromUnits } from '../../../shared/product-currency.ts';

const TYPE_LABEL: Record<QueueEntry['type'], string> = { item: '🎨 항목', post: '📝 글', comment: '💬 댓글' };
const linkOf = (q: QueueEntry) => (q.type === 'item' ? `/community/items/${q.id}` : `/forum/${q.type === 'post' ? q.id : q.postId}`);

function Queue({ onError }: { onError: (m: string) => void }) {
  const [queue, setQueue] = useState<QueueEntry[] | null>(null);
  const load = () => siteApi.adminQueue().then(setQueue, (e) => onError(errorText(e)));
  useEffect(() => void load(), []);

  const resolve = (q: QueueEntry, action: 'restore' | 'remove') => {
    if (action === 'remove' && !window.confirm('되돌릴 수 없어요. 내릴까요?')) return;
    siteApi.adminResolve(q.type, q.id, action).then(load, (e) => onError(errorText(e)));
  };

  if (queue === null) return <p className="muted">불러오는 중…</p>;
  if (queue.length === 0) return <p className="muted">확인할 신고가 없어요. 🎉</p>;
  return (
    <ul className="queue">
      {queue.map((q) => (
        <li key={`${q.type}:${q.id}`} className="card">
          <div className="row between">
            <span>
              <span className="muted small">{TYPE_LABEL[q.type]}</span> <Link href={linkOf(q)}>{q.title}</Link>
              {q.status !== 'published' && <span className="badge warn">{q.status === 'hidden' ? '가려짐' : q.status}</span>}
            </span>
            <span className="muted small">
              {q.author.handle ? `@${q.author.handle}` : ''} {q.author.email}
            </span>
          </div>
          <ul className="small">
            {q.reports.map((r, i) => (
              <li key={i}>
                “{r.reason}” <span className="muted">— {r.by ? `@${r.by}` : '알 수 없음'}, {ago(r.at)}</span>
              </li>
            ))}
          </ul>
          <div className="row">
            <button className="button small" onClick={() => resolve(q, 'restore')}>
              문제없음 · 다시 공개
            </button>
            <button className="button small ghost danger" onClick={() => resolve(q, 'remove')}>
              내리기
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Users({ me, onError }: { me: Me; onError: (m: string) => void }) {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const load = (text = q) => siteApi.adminUsers(text).then(setUsers, (e) => onError(errorText(e)));
  useEffect(() => void load(''), []);

  const toggle = (u: AdminUser) => {
    const on = u.status === 'active';
    const reason = on ? window.prompt(`${u.email} 계정을 정지할까요? 이유를 적어 주세요.`) : '';
    if (on && !reason?.trim()) return;
    siteApi.adminSuspend(u.id, on, reason ?? '').then(() => load(), (e) => onError(errorText(e)));
  };

  return (
    <>
      <form
        className="row search"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="메일이나 아이디로 찾기" />
        <button className="button small">찾기</button>
      </form>
      <table className="admin-table">
        <thead>
          <tr>
            <th>계정</th>
            <th>항목</th>
            <th>글</th>
            <th>가입</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users?.map((u) => (
            <tr key={u.id} className={u.status === 'suspended' ? 'suspended' : ''}>
              <td>
                {u.handle ? <Link href={`/u/${u.handle}`}>@{u.handle}</Link> : '—'} <span className="muted small">{u.email}</span>
                {u.role === 'admin' && <span className="badge">운영자</span>}
                {u.status === 'suspended' && <span className="badge warn">정지</span>}
              </td>
              <td>{u.items}</td>
              <td>{u.posts}</td>
              <td className="muted small">{new Date(u.createdAt).toLocaleDateString('ko-KR')}</td>
              <td>
                {u.role !== 'admin' && u.id !== me.account?.id && (
                  <button className="button small ghost" onClick={() => toggle(u)}>
                    {u.status === 'active' ? '정지' : '정지 풀기'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

const won = formatProductUsd;

function Money({ onError }: { onError: (m: string) => void }) {
  type Balances = Awaited<ReturnType<typeof siteApi.adminBalances>>;
  type Sales = Awaited<ReturnType<typeof siteApi.adminSales>>;
  const [balances, setBalances] = useState<Balances | null>(null);
  const [sales, setSales] = useState<Sales>([]);
  const load = () => {
    siteApi.adminBalances().then(setBalances, (e) => onError(errorText(e)));
    siteApi.adminSales().then(setSales, (e) => onError(errorText(e)));
  };
  useEffect(load, []);

  const payout = (b: Balances[number]) => {
    const amount = window.prompt(`@${b.handle ?? b.email}에게 보낸 금액(USD)을 적어 주세요. 남은 금액 ${won(b.balance)}`, String(productUsdFromUnits(b.balance)));
    if (!amount) return;
    const note = window.prompt('메모 (예: 10월 정산 계좌이체)') ?? '';
    siteApi.adminPayout(b.creatorId, productUnitsFromUsd(Number(amount)), note).then(load, (e) => onError(errorText(e)));
  };
  const refund = (id: string) => {
    const reason = window.prompt('환불 이유를 적어 주세요. 돈을 돌려주고 내려받기를 막아요.');
    if (!reason?.trim()) return;
    siteApi.adminRefund(id, reason).then(load, (e) => onError(errorText(e)));
  };

  return (
    <>
      <h2>제작자별 받을 금액</h2>
      {balances === null ? (
        <p className="muted">불러오는 중…</p>
      ) : balances.length === 0 ? (
        <p className="muted">아직 판매가 없어요.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>제작자</th>
              <th>총 판매액</th>
              <th>받을 금액</th>
              <th>마지막 지급</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {balances.map((b) => (
              <tr key={b.creatorId}>
                <td>
                  {b.handle ? <Link href={`/u/${b.handle}`}>@{b.handle}</Link> : '—'} <span className="muted small">{b.email}</span>
                </td>
                <td>{won(b.gross)}</td>
                <td>
                  <b>{won(b.balance)}</b>
                </td>
                <td className="muted small">{b.lastPayout ? new Date(b.lastPayout).toLocaleDateString('ko-KR') : '—'}</td>
                <td>
                  {b.balance > 0 && (
                    <button className="button small" onClick={() => payout(b)}>
                      지급 기록
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small">돈은 직접 보낸 뒤 "지급 기록"으로 장부에 남겨요. 남은 금액보다 많이는 기록할 수 없어요.</p>

      <h2>최근 판매</h2>
      <table className="admin-table small">
        <tbody>
          {sales.map((x) => (
            <tr key={x.id} className={x.status === 'refunded' ? 'suspended' : ''}>
              <td className="muted">{ago(x.at)}</td>
              <td>{x.title}</td>
              <td className="muted">
                {x.buyer} → @{x.seller}
              </td>
              <td>
                {won(x.amountKrw)} <span className="muted">(수수료 {won(x.feeKrw)})</span>
              </td>
              <td>
                {x.status === 'refunded' ? (
                  <span className="badge warn">환불됨</span>
                ) : (
                  <button className="button small ghost" onClick={() => refund(x.id)}>
                    환불
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Log({ onError }: { onError: (m: string) => void }) {
  const [log, setLog] = useState<AuditEntry[] | null>(null);
  useEffect(() => void siteApi.adminLog().then(setLog, (e) => onError(errorText(e))), []);
  if (log === null) return <p className="muted">불러오는 중…</p>;
  if (log.length === 0) return <p className="muted">아직 기록이 없어요.</p>;
  return (
    <table className="admin-table small">
      <tbody>
        {log.map((l) => (
          <tr key={l.id}>
            <td className="muted">{ago(l.at)}</td>
            <td>{l.actor ? `@${l.actor}` : '—'}</td>
            <td>
              <code>{l.action}</code>
            </td>
            <td>
              <code>{l.target}</code>
            </td>
            <td className="muted">{typeof l.detail.reason === 'string' ? l.detail.reason : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AdminPage({ me }: { me: Me | null }) {
  const [tab, setTab] = useState<'queue' | 'users' | 'money' | 'log'>('queue');
  const [error, setError] = useState('');
  if (!me) return <section className="page narrow">불러오는 중…</section>;
  if (me.account?.role !== 'admin') {
    return (
      <section className="page narrow">
        <h1>운영</h1>
        <p>운영자만 볼 수 있어요.</p>
      </section>
    );
  }
  return (
    <section className="page">
      <h1>운영</h1>
      <div className="tabs">
        <button className={tab === 'queue' ? 'active' : ''} onClick={() => setTab('queue')}>
          🚩 신고·검수
        </button>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>
          👥 사용자
        </button>
        <button className={tab === 'money' ? 'active' : ''} onClick={() => setTab('money')}>
          💰 판매·정산
        </button>
        <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>
          📜 기록
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {tab === 'queue' && <Queue onError={setError} />}
      {tab === 'users' && <Users me={me} onError={setError} />}
      {tab === 'money' && <Money onError={setError} />}
      {tab === 'log' && <Log onError={setError} />}
    </section>
  );
}
