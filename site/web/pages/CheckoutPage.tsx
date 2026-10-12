import { useEffect, useState } from 'react';
import { planOf, isPlan, priceFor, type BillingInterval } from '../../../shared/plans.ts';
import { siteApi, type CheckoutView, type Me } from '../api.ts';
import { Link } from '../router.tsx';
import { formatProductUsd } from '../../../shared/product-currency.ts';
import { SiteIcon } from '../components/SiteIcon.tsx';
import { rich, t, tpl } from '../i18n.tsx';

/** Where the app sends the owner to buy a plan: /checkout?plan=&install=&ref=&return=[&interval=year] */
export function CheckoutPage({ me, search }: { me: Me | null; search: string }) {
  const params = new URLSearchParams(search);
  const plan = params.get('plan') ?? '';
  const install = params.get('install') ?? '';
  const returnUrl = params.get('return') ?? '';
  const [interval, setBillingInterval] = useState<BillingInterval>(params.get('interval') === 'year' ? 'year' : 'month');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!me) return <section className="page narrow">{t('불러오는 중…')}</section>;
  if (!isPlan(plan) || !planOf(plan).priceKrw || !install) {
    return (
      <section className="page narrow">
        <h1>{t('결제')}</h1>
        <p className="error">{t('결제 정보가 없어요. 앱의 플랜·구성원 화면에서 "결제하고 바꾸기"를 눌러 다시 시작해 주세요.')}</p>
      </section>
    );
  }
  if (!me.account) {
    return (
      <section className="page narrow">
        <h1>{t('결제하려면 로그인하세요')}</h1>
        <p>{t('라이선스와 결제 내역이 계정에 남아요. 처음이면 자동으로 가입돼요.')}</p>
        <Link href={`/login?next=${encodeURIComponent(`/checkout${search}`)}`} className="button">
          {t('로그인하고 계속하기')}
        </Link>
      </section>
    );
  }

  const meta = planOf(plan);
  let returnHost = '';
  try {
    returnHost = returnUrl ? new URL(returnUrl).host : '';
  } catch {
    returnHost = '';
  }

  const pay = async () => {
    setBusy(true);
    setError('');
    try {
      const { url } = await siteApi.startCheckout({ plan, install, ref: params.get('ref') ?? undefined, returnUrl: returnUrl || undefined, interval });
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <section className="page narrow">
      <h1>
        <SiteIcon name={meta.id === 'business' ? 'office' : 'team'} /> {tpl('{plan} 플랜 결제', { plan: t(meta.label) })}
      </h1>
      <div className="card">
        <div className="tabs interval-tabs" role="radiogroup" aria-label={t('결제 주기')}>
          <button type="button" role="radio" aria-checked={interval === 'month'} className={interval === 'month' ? 'active' : ''} onClick={() => setBillingInterval('month')}>
            {t('월간')} {formatProductUsd(meta.priceKrw)}
          </button>
          <button type="button" role="radio" aria-checked={interval === 'year'} className={interval === 'year' ? 'active' : ''} onClick={() => setBillingInterval('year')}>
            {t('연간')} {formatProductUsd(meta.priceYearly)} <span className="badge ok">{t('2개월 무료')}</span>
          </button>
        </div>
        <div className="price">
          <b>{formatProductUsd(priceFor(meta.id, interval))}</b> / {interval === 'year' ? t('년') : t('월')}
          {interval === 'year' && <span className="muted small"> ({tpl('월 {price} 꼴', { price: formatProductUsd(Math.round(meta.priceYearly / 12)) })})</span>}
        </div>
        <p>{t(meta.description)}</p>
        <ul className="checks">
          <li>{tpl('구성원 최대 {n}명', { n: meta.maxMembers })}</li>
          <li>{interval === 'year' ? t('1년마다 자동 결제, 내 계정에서 언제든 해지') : t('30일마다 자동 결제, 내 계정에서 언제든 해지')}</li>
        </ul>
        <p className="muted small">
          {t('적용할 설치:')} <code>{install}</code>
        </p>
        {returnHost ? (
          <p className="small">{rich('결제가 끝나면 {host}(내 사무실 앱)로 돌아가 바로 적용돼요. 내가 연 앱 주소가 맞는지 확인하세요.', { host: <b>{returnHost}</b> })}</p>
        ) : (
          <p className="small">{t('결제가 끝나면 내 계정에서 라이선스 키를 복사해 앱에 붙여 넣으세요.')}</p>
        )}
        {error && <p className="error">{error}</p>}
        <button className="button big" disabled={busy} onClick={() => void pay()}>
          {busy ? t('결제 화면으로 가는 중…') : tpl('{price} 결제하기', { price: formatProductUsd(priceFor(meta.id, interval)) })}
        </button>
      </div>
    </section>
  );
}

/** The mock provider's payment page: stands in for Toss Payments or Paddle until one is connected. */
export function MockPaymentPage({ id }: { id: string }) {
  const [checkout, setCheckout] = useState<CheckoutView | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    siteApi.checkout(id).then(setCheckout, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  const finish = async (paid: boolean) => {
    try {
      const { redirect } = await siteApi.mockPay(id, paid);
      if (paid && redirect) return window.location.assign(redirect);
      setDone(paid ? (checkout?.kind === 'item' ? t('결제됐어요. 내 계정의 "구매한 테마"에서 내려받으세요.') : t('결제됐어요. 내 계정에서 라이선스 키를 복사해 앱에 붙여 넣으세요.')) : t('결제가 실패한 것으로 처리했어요.'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="page narrow">
      <h1>{t('모의 결제')}</h1>
      <p className="muted">{t('실제 결제사가 연결되기 전까지 쓰는 시험용 화면이에요. 돈은 나가지 않아요.')}</p>
      {error && <p className="error">{error}</p>}
      {checkout && (
        <div className="card">
          <p>
            {checkout.kind === 'item' ? tpl('테마 "{title}"', { title: checkout.itemTitle ?? '' }) : tpl('{plan} 플랜', { plan: t(planOf(checkout.plan as never).label) })} · <b>{formatProductUsd(checkout.amountKrw)}</b>
          </p>
          {checkout.status !== 'open' || done ? (
            <>
              <p>{done || t('이미 끝난 결제예요.')}</p>
              <Link href="/account" className="button">
                {t('내 계정으로')}
              </Link>
            </>
          ) : (
            <div className="row">
              <button className="button" onClick={() => void finish(true)}>
                {t('결제 성공')}
              </button>
              <button className="button ghost" onClick={() => void finish(false)}>
                {t('결제 실패')}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
