import { useEffect, useState } from 'react';
import { siteApi, type Me } from '../api.ts';
import { Link } from '../router.tsx';
import { rich, t } from '../i18n.tsx';

/**
 * Paddle's "default payment link": Paddle sends buyers here with ?_ptxn=<transaction>, Paddle.js opens its checkout
 * over the page, and once paid the page waits for the webhook to land, then goes on (back to the app or the item).
 */

declare global {
  interface Window {
    Paddle?: {
      Environment: { set(env: string): void };
      Initialize(options: { token: string; eventCallback?: (event: { name?: string }) => void }): void;
    };
  }
}

const PADDLE_JS = 'https://cdn.paddle.com/paddle/v2/paddle.js';
const WAIT_MS = 60_000;

function loadPaddle(): Promise<NonNullable<Window['Paddle']>> {
  if (window.Paddle) return Promise.resolve(window.Paddle);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PADDLE_JS;
    script.onload = () => (window.Paddle ? resolve(window.Paddle) : reject(new Error(t('Paddle.js를 불러오지 못했어요.'))));
    script.onerror = () => reject(new Error(t('Paddle.js를 불러오지 못했어요. 광고 차단기를 끄고 다시 시도해 주세요.')));
    document.head.append(script);
  });
}

export function PaddleCheckoutPage({ me, search }: { me: Me | null; search: string }) {
  const params = new URLSearchParams(search);
  const checkoutId = params.get('chk') ?? '';
  const [state, setState] = useState<'loading' | 'open' | 'waiting' | 'closed' | 'late'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!params.get('_ptxn') || !checkoutId) return;
    let cancelled = false;
    const waitForWebhook = async () => {
      setState('waiting');
      const until = Date.now() + WAIT_MS;
      while (!cancelled && Date.now() < until) {
        try {
          const view = await siteApi.checkout(checkoutId);
          if (view.redirect) return window.location.assign(view.redirect);
        } catch {
          // Signed out in another tab or a hiccup: keep waiting, the account page has the result anyway.
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!cancelled) setState('late');
    };
    (async () => {
      const config = await siteApi.paymentsConfig();
      if (config.provider !== 'paddle' || !config.token) throw new Error(t('Paddle 결제가 켜져 있지 않아요.'));
      const paddle = await loadPaddle();
      if (config.env === 'sandbox') paddle.Environment.set('sandbox');
      paddle.Initialize({
        token: config.token,
        eventCallback: (event) => {
          if (event.name === 'checkout.completed') void waitForWebhook();
          if (event.name === 'checkout.closed') setState((s) => (s === 'open' ? 'closed' : s));
        },
      });
      // Paddle.js opens the transaction in the address (_ptxn) by itself.
      if (!cancelled) setState('open');
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [search]);

  if (!params.get('_ptxn') || !checkoutId) {
    return (
      <section className="page narrow">
        <h1>{t('결제')}</h1>
        <p className="error">{t('결제 정보가 없어요. 결제를 처음부터 다시 시작해 주세요.')}</p>
      </section>
    );
  }
  return (
    <section className="page narrow">
      <h1>{t('결제')}</h1>
      {error && <p className="error">{error}</p>}
      {!error && state === 'loading' && <p className="muted">{t('결제 창을 여는 중…')}</p>}
      {!error && state === 'open' && <p className="muted">{t('Paddle 결제 창에서 결제를 마쳐 주세요. Paddle이 판매자로서 결제와 세금 처리를 맡아요.')}</p>}
      {state === 'waiting' && <p>{t('결제됐어요. 확인하는 중이에요… 잠시만 기다려 주세요.')}</p>}
      {state === 'closed' && (
        <p>
          {t('결제 창을 닫았어요.')} <button className="link-button" onClick={() => location.reload()}>{t('다시 열기')}</button>
        </p>
      )}
      {state === 'late' && (
        <p>{rich('결제 확인이 늦어지고 있어요. 몇 분 뒤 {account}에서 결과를 확인해 주세요.', { account: <Link href="/account">{t('내 계정')}</Link> })}</p>
      )}
      {!me?.account && <p className="muted small">{t('결제 결과는 결제를 시작한 계정에 남아요.')}</p>}
    </section>
  );
}
