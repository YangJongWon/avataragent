import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useState } from 'react';
import { siteApi } from '../api.ts';
import { Link } from '../router.tsx';

export function DocsPage({ slug }: { slug?: string }) {
  const [list, setList] = useState<{ slug: string; title: string }[]>([]);
  const [doc, setDoc] = useState<{ title: string; html: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    siteApi.docs().then(setList, () => setList([]));
  }, []);

  useEffect(() => {
    setDoc(null);
    setError('');
    if (!slug) return;
    siteApi.doc(slug).then(
      (d) => setDoc({ title: d.title, html: DOMPurify.sanitize(marked.parse(d.markdown, { async: false })) }),
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [slug]);

  return (
    <section className="page docs">
      <aside>
        <h3>문서</h3>
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
          <>
            <h1>문서</h1>
            <p>왼쪽에서 문서를 고르세요.</p>
          </>
        )}
        {error && <p className="error">{error}</p>}
        {doc && <div dangerouslySetInnerHTML={{ __html: doc.html }} />}
      </article>
    </section>
  );
}
