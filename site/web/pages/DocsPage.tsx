import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useState } from 'react';
import { siteApi } from '../api.ts';
import { Link } from '../router.tsx';
import { currentLanguage, t } from '../i18n.tsx';

export function DocsPage({ slug }: { slug?: string }) {
  const [list, setList] = useState<{ slug: string; title: string }[]>([]);
  const [doc, setDoc] = useState<{ title: string; html: string } | null>(null);
  const [error, setError] = useState('');
  const language = currentLanguage();

  useEffect(() => {
    siteApi.docs(language).then(setList, () => setList([]));
  }, [language]);

  useEffect(() => {
    setDoc(null);
    setError('');
    if (!slug) return;
    siteApi.doc(slug, language).then(
      (d) => setDoc({ title: d.title, html: DOMPurify.sanitize(marked.parse(d.markdown, { async: false })) }),
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [slug, language]);

  return (
    <section className="page docs">
      <aside>
        <div className="docs-sidebar-title">
          <span className="docs-sidebar-icon" aria-hidden="true">✦</span>
          <div>
            <span className="docs-eyebrow">GUIDES</span>
            <h3>{t('문서')}</h3>
          </div>
        </div>
        <ul>
          {list.map((d) => (
            <li key={d.slug}>
              <Link href={`/docs/${d.slug}`} className={d.slug === slug ? 'active' : ''}>
                {d.title}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      <article className="markdown">
        {!slug && (
          <div className="docs-welcome">
            <span className="docs-welcome-icon" aria-hidden="true">✦</span>
            <span className="docs-eyebrow">AVATARCAST DOCS</span>
            <h1>{t('문서')}</h1>
            <p>{t('궁금한 주제를 왼쪽 메뉴에서 골라보세요.')}</p>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {doc && <div dangerouslySetInnerHTML={{ __html: doc.html }} />}
      </article>
    </section>
  );
}
