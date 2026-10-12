import { useState } from 'react';
import { siteApi, type Me } from '../api.ts';
import { Link } from '../router.tsx';
import { rich, t } from '../i18n.tsx';

export function LoginPage({ me, search }: { me: Me | null; search: string }) {
  const params = new URLSearchParams(search);
  const next = params.get('next') ?? '/account';
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get('error') ?? '');

  if (me?.account) {
    return (
      <section className="page narrow">
        <h1>{t('이미 로그인했어요')}</h1>
        <p>
          {me.account.email} · <Link href="/account">{t('내 계정')}</Link>
        </p>
      </section>
    );
  }

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      await siteApi.sendLink(email, next);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const oauth = (provider: 'google' | 'github') => `/api/auth/${provider}?next=${encodeURIComponent(next)}`;

  return (
    <section className="page narrow login">
      <h1>{t('로그인')}</h1>
      <p className="lead">{t('테마를 올리고, 좋아요를 누르고, 플랜을 관리하려면 로그인하세요. 처음이면 자동으로 가입돼요.')}</p>
      {error && <p className="error">{error}</p>}
      <div className="card">
        {sent ? (
          <p>{rich('{email}로 로그인 링크를 보냈어요. 15분 안에 메일의 링크를 눌러 주세요.', { email: <b>{email}</b> })}</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label>
              {t('메일 주소')}
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </label>
            <button className="button" disabled={busy}>
              {busy ? t('보내는 중…') : t('로그인 링크 받기')}
            </button>
          </form>
        )}
        {(me?.providers.google || me?.providers.github) && <div className="or">{t('또는')}</div>}
        <div className="oauth">
          {me?.providers.google && (
            <a className="button ghost" href={oauth('google')}>
              {t('구글로 계속하기')}
            </a>
          )}
          {me?.providers.github && (
            <a className="button ghost" href={oauth('github')}>
              {t('GitHub로 계속하기')}
            </a>
          )}
        </div>
      </div>
      <p className="muted small">{t('같은 메일 주소면 어떤 방법으로 로그인해도 같은 계정이에요.')}</p>
    </section>
  );
}
