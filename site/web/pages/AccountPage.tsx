import { useEffect, useState } from 'react';
import { planOf } from '../../../shared/plans.ts';
import { siteApi, type LicenseView, type Me } from '../api.ts';
import { Link, navigate } from '../router.tsx';

const STATUS: Record<LicenseView['status'], string> = { active: '이용 중', past_due: '결제 실패 (유예 중)', canceled: '종료' };
const day = (iso: string) => new Date(iso).toLocaleDateString('ko-KR');

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
          {planOf(license.plan as never).emoji} {planOf(license.plan as never).label} 플랜
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
  const signedIn = Boolean(me?.account);

  useEffect(() => {
    if (signedIn) siteApi.licenses().then(setLicenses, () => setLicenses([]));
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

      <div className="card">
        <h3>내 테마와 활동</h3>
        <p className="muted">커뮤니티가 열리면 올린 항목, 좋아요, 구매한 테마가 여기 모여요. (준비 중)</p>
      </div>
      <button className="button ghost" onClick={() => void logout()}>
        로그아웃
      </button>
    </section>
  );
}
