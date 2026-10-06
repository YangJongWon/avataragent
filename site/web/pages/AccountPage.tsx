import { useEffect, useState } from 'react';
import { planOf } from '../../../shared/plans.ts';
import { siteApi, type Earnings, type ItemCard, type LicenseView, type Me, type Purchase } from '../api.ts';
import { Link, navigate } from '../router.tsx';
import { ItemCardView } from './CommunityPage.tsx';
import { formatProductUsd } from '../../../shared/product-currency.ts';

const STATUS: Record<LicenseView['status'], string> = { active: '이용 중', past_due: '결제 실패 (유예 중)', canceled: '종료' };
const day = (iso: string) => new Date(iso).toLocaleDateString('ko-KR');
const won = formatProductUsd;
const ENTRY: Record<Earnings['entries'][number]['kind'], string> = { sale: '판매', fee: '수수료', refund: '환불', fee_refund: '수수료 돌려받음', payout: '지급' };

function EarningsCard({ earnings }: { earnings: Earnings }) {
  return (
    <>
      <h2>판매 수익</h2>
      <div className="card">
        <div className="stats">
          <div>
            <b>{won(earnings.balance)}</b>
            <span>받을 금액</span>
          </div>
          <div>
            <b>{earnings.sales}</b>
            <span>판매 건수</span>
          </div>
          <div>
            <b>{won(earnings.gross)}</b>
            <span>총 판매액</span>
          </div>
          <div>
            <b>{won(earnings.payouts)}</b>
            <span>지급받은 금액</span>
          </div>
        </div>
        <p className="muted small">
          판매액의 {Math.round(earnings.share * 100)}%가 내 몫이에요. 받을 금액은 매달 정산해 운영자가 보내 드려요(정산 계좌는 메일로 안내).
          {earnings.refunds > 0 && ` 환불 ${won(earnings.refunds)}은 빼고 계산했어요.`}
        </p>
        {earnings.entries.length > 0 && (
          <table className="admin-table small">
            <tbody>
              {earnings.entries.map((e, i) => (
                <tr key={i}>
                  <td className="muted">{day(e.at)}</td>
                  <td>{ENTRY[e.kind]}</td>
                  <td>{e.title ?? e.note}</td>
                  <td className={e.amountKrw >= 0 ? 'pos' : 'error'}>{(e.amountKrw >= 0 ? '+' : '') + won(e.amountKrw)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function LicenseCard({ license, onChange }: { license: LicenseView; onChange: (list: LicenseView[]) => void }) {
  const [copied, setCopied] = useState(false);
  const [moving, setMoving] = useState(false);
  const [install, setInstall] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [token, setToken] = useState(license.token);

  const run = async (work: () => Promise<void>) => {
    setError('');
    setMessage('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="card license">
      <div className="row between">
        <b>
          {planOf(license.plan as never).emoji} {planOf(license.plan as never).label} 플랜{license.interval === 'year' ? ' · 연간' : ''}
        </b>
        <span className={license.status === 'active' ? 'pos' : 'error'}>{STATUS[license.status]}</span>
      </div>
      <p className="muted small">
        {license.status === 'canceled' ? '종료됨' : license.cancelAtPeriodEnd ? `${day(license.periodEnd)}에 끝나요` : `다음 결제일 ${day(license.periodEnd)}`} · 설치 <code>{license.installId}</code>
      </p>
      {license.status !== 'canceled' && (
        <>
          <div className="row">
            <button
              className="button small"
              onClick={() =>
                void navigator.clipboard.writeText(token).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
              }
            >
              {copied ? '복사됨' : '라이선스 키 복사'}
            </button>
            <button className="button small ghost" onClick={() => setMoving((m) => !m)}>
              다른 설치로 옮기기
            </button>
            <button
              className="button small ghost"
              onClick={() =>
                void run(async () => {
                  if (!license.cancelAtPeriodEnd && !window.confirm('구독을 해지할까요? 이번 결제 기간이 끝날 때까지는 그대로 써요.')) return;
                  onChange(await siteApi.setCancel(license.subscriptionId, !license.cancelAtPeriodEnd));
                })
              }
            >
              {license.cancelAtPeriodEnd ? '해지 취소' : '구독 해지'}
            </button>
          </div>
          {moving && (
            <form
              className="row move"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const moved = await siteApi.transfer(license.id, install.trim());
                  setToken(moved.token);
                  setMoving(false);
                  setMessage('옮겼어요. 새 키를 복사해 새 설치의 플랜 화면에 붙여 넣으세요. 이전 설치는 다음 확인 때 개인 플랜으로 돌아가요.');
                  onChange(await siteApi.licenses());
                });
              }}
            >
              <input value={install} onChange={(e) => setInstall(e.target.value)} placeholder="새 설치의 ID (ins_…)" />
              <button className="button small">옮기기</button>
            </form>
          )}
          <p className="muted small">결제가 끝나면 앱에 자동으로 적용돼요. 앱이 다른 컴퓨터에 있으면 키를 복사해 앱의 플랜·구성원 화면에 붙여 넣으세요.</p>
        </>
      )}
      {message && <p className="pos small">{message}</p>}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}

export function AccountPage({ me, onLogout }: { me: Me | null; onLogout: () => void }) {
  const [licenses, setLicenses] = useState<LicenseView[] | null>(null);
  const [items, setItems] = useState<ItemCard[] | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const signedIn = Boolean(me?.account);

  useEffect(() => {
    if (!signedIn) return;
    siteApi.licenses().then(setLicenses, () => setLicenses([]));
    siteApi.myItems().then(setItems, () => setItems([]));
    siteApi.purchases().then(setPurchases, () => setPurchases([]));
    siteApi.earnings().then(setEarnings, () => setEarnings(null));
  }, [signedIn]);

  if (!me) return <section className="page narrow">불러오는 중…</section>;
  if (!me.account) {
    return (
      <section className="page narrow">
        <h1>내 계정</h1>
        <p>
          <Link href="/login?next=/account">로그인</Link>이 필요해요.
        </p>
      </section>
    );
  }
  const { account } = me;
  const logout = async () => {
    await siteApi.logout();
    onLogout();
    navigate('/');
  };
  return (
    <section className="page narrow">
      <h1>내 계정</h1>
      <div className="card account">
        {account.avatarUrl && <img src={account.avatarUrl} alt="" className="avatar" referrerPolicy="no-referrer" />}
        <div>
          <b>{account.name || account.email}</b>
          {account.role === 'admin' && <span className="badge">관리자</span>}
          <div className="muted">{account.email}</div>
          {account.handle && (
            <Link href={`/u/${account.handle}`} className="small">
              내 프로필 (@{account.handle}) →
            </Link>
          )}
        </div>
      </div>

      <h2>라이선스</h2>
      {licenses === null ? (
        <p className="muted">불러오는 중…</p>
      ) : licenses.length === 0 ? (
        <div className="card">
          <p className="muted">
            아직 산 플랜이 없어요. 앱의 플랜·구성원 화면에서 팀·비즈니스 플랜을 고르면 여기로 와서 결제해요. <Link href="/pricing">가격 보기</Link>
          </p>
        </div>
      ) : (
        licenses.map((l) => <LicenseCard key={l.id} license={l} onChange={setLicenses} />)
      )}

      {purchases.length > 0 && (
        <>
          <h2>구매한 테마</h2>
          <div className="card">
            <table className="admin-table">
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/community/items/${p.itemId}`}>{p.title}</Link>
                    </td>
                    <td className="muted small">{day(p.createdAt)}</td>
                    <td>{won(p.amountKrw)}</td>
                    <td>{p.available ? <a href={`/api/items/${p.itemId}/download`}>내려받기</a> : <span className="muted small">{p.status === 'refunded' ? '환불됨' : '내려간 항목'}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {earnings && (earnings.sales > 0 || (items ?? []).some((i) => i.priceKrw > 0)) && <EarningsCard earnings={earnings} />}

      <div className="row between">
        <h2>내가 올린 항목</h2>
        <Link href="/community/upload" className="button small">
          올리기
        </Link>
      </div>
      {items === null ? (
        <p className="muted">불러오는 중…</p>
      ) : items.length === 0 ? (
        <div className="card">
          <p className="muted">아직 올린 항목이 없어요. 테마·업무 흐름·플레이북을 커뮤니티에 나눠 보세요.</p>
        </div>
      ) : (
        <div className="gallery compact">{items.map((item) => <ItemCardView key={item.id} item={item} />)}</div>
      )}
      <button className="button ghost" onClick={() => void logout()}>
        로그아웃
      </button>
    </section>
  );
}
