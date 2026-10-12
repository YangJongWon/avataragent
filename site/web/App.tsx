import { useEffect, useState } from 'react';
import { siteApi, type Me } from './api.ts';
import { AccountPage } from './pages/AccountPage.tsx';
import { AdminPage } from './pages/AdminPage.tsx';
import { ProfilePage, RankingPage } from './pages/CreatorsPage.tsx';
import { ForumPage, PostEditorPage, PostPage } from './pages/ForumPage.tsx';
import { CheckoutPage, MockPaymentPage } from './pages/CheckoutPage.tsx';
import { CommunityPage } from './pages/CommunityPage.tsx';
import { DocsPage } from './pages/DocsPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { InstallPage } from './pages/InstallPage.tsx';
import { ItemPage } from './pages/ItemPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { PaddleCheckoutPage } from './pages/PaddleCheckoutPage.tsx';
import { PricingPage } from './pages/PricingPage.tsx';
import { UploadPage } from './pages/UploadPage.tsx';
import { Link, useLocation } from './router.tsx';
import { SiteIcon, type SiteIconName } from './components/SiteIcon.tsx';
import { chooseLanguage, currentLanguage, isLanguage, languageForCountry, LANGUAGES, setLanguage, t, type Language } from './i18n.tsx';

const NAV_ICON: Record<string, SiteIconName> = {
  '/': 'home', '/pricing': 'pricing', '/install': 'download', '/community': 'community', '/forum': 'forum', '/ranking': 'ranking', '/docs': 'docs',
};

const NAV: [string, string][] = [
  ['/', '홈'],
  ['/pricing', '가격'],
  ['/install', '설치'],
  ['/community', '커뮤니티'],
  ['/forum', '게시판'],
  ['/ranking', '랭킹'],
  ['/docs', '문서'],
];

export function App() {
  const { path, search } = useLocation();
  const [me, setMe] = useState<Me | null>(null);
  const [language, setLanguageState] = useState<Language>(currentLanguage);
  const showLanguage = (next: Language) => {
    setLanguage(next);
    setLanguageState(next);
  };
  const refresh = () =>
    siteApi.me().then(
      (m) => {
        setMe(m);
        showLanguage(languageForCountry(m.country));
      },
      () => setMe({ account: null, providers: { email: true, google: false, github: false } }),
    );

  useEffect(() => {
    void refresh();
    setLanguage(currentLanguage());
  }, []);

  const page = (() => {
    if (path === '/') return <HomePage />;
    if (path === '/pricing') return <PricingPage />;
    if (path === '/install') return <InstallPage />;
    if (path === '/community') return <CommunityPage search={search} />;
    if (path === '/community/upload') return <UploadPage me={me} search={search} />;
    if (path.startsWith('/community/items/')) return <ItemPage id={path.split('/')[3]} me={me} />;
    if (path === '/forum') return <ForumPage search={search} />;
    if (path === '/forum/new') return <PostEditorPage me={me} search={search} />;
    if (/^\/forum\/[^/]+\/edit$/.test(path)) return <PostEditorPage me={me} search={search} editId={path.split('/')[2]} />;
    if (path.startsWith('/forum/')) return <PostPage id={path.split('/')[2]} me={me} />;
    if (path === '/ranking') return <RankingPage search={search} />;
    if (path.startsWith('/u/')) return <ProfilePage handle={decodeURIComponent(path.split('/')[2])} me={me} />;
    if (path === '/admin') return <AdminPage me={me} />;
    if (path === '/docs' || path.startsWith('/docs/')) return <DocsPage slug={path.split('/')[2]} />;
    if (path === '/login') return <LoginPage me={me} search={search} />;
    if (path === '/account') return <AccountPage me={me} onLogout={refresh} />;
    if (path === '/checkout') return <CheckoutPage me={me} search={search} />;
    if (path === '/checkout/paddle') return <PaddleCheckoutPage me={me} search={search} />;
    if (path.startsWith('/checkout/mock/')) return <MockPaymentPage id={path.split('/')[3]} />;
    return (
      <section className="page narrow">
        <h1>{t('찾는 페이지가 없어요')}</h1>
        <p>
          <Link href="/">{t('처음으로')}</Link>
        </p>
      </section>
    );
  })();

  return (
    <div className="site">
      <header className="site-head">
        <Link href="/" className="brand">
          <img className="brand-mark" src="/logo-mark.png" alt="" />
          <span className="brand-name">AvatarCast</span>
        </Link>
        <nav>
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className={href === '/' ? (path === '/' ? 'active' : '') : path.startsWith(href) ? 'active' : ''}>
              <SiteIcon name={NAV_ICON[href]} />
              {t(label)}
            </Link>
          ))}
        </nav>
        <div className="head-account">
          <select
            className="lang-select"
            value={language}
            aria-label="Language"
            onChange={(e) => {
              if (!isLanguage(e.target.value)) return;
              chooseLanguage(e.target.value);
              setLanguageState(e.target.value);
            }}
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          {me?.account?.role === 'admin' && (
            <Link href="/admin" className="admin-link">
              {t('운영')}
            </Link>
          )}
          {me?.account ? (
            <Link href="/account" className="button ghost">
              {me.account.name || me.account.email}
            </Link>
          ) : (
            <Link href="/login" className="button">
              {t('로그인')}
            </Link>
          )}
        </div>
      </header>
      <main>{page}</main>
      <footer className="site-foot">
        <span>© 2026 YangJongWon · {t('앱은 AGPL-3.0과 상업 라이선스')}</span>
        <Link href="/docs/licensing">{t('라이선스')}</Link>
        <Link href="/docs/privacy">{t('개인정보 처리방침')}</Link>
        <a href="https://github.com/YangJongWon/avataragent">GitHub</a>
        <a href="mailto:doc.corax@gmail.com">{t('문의')}</a>
      </footer>
    </div>
  );
}
