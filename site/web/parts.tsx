import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useMemo } from 'react';
import type { Author } from './api.ts';
import { Link } from './router.tsx';

/** Markdown written by people: rendered, then sanitized, and links open safely in a new tab. */
export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => {
    const clean = DOMPurify.sanitize(marked.parse(text, { async: false, breaks: true }), { FORBID_TAGS: ['style', 'form', 'input'], FORBID_ATTR: ['style'] });
    return clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer nofollow" ');
  }, [text]);
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function AuthorLink({ author }: { author: Author }) {
  const label = author.name || author.handle || '알 수 없음';
  return author.handle ? <Link href={`/u/${author.handle}`}>{label}</Link> : <span>{label}</span>;
}

export function Avatar({ url, name, size = 28 }: { url: string; name: string; size?: number }) {
  return url ? (
    <img className="avatar-s" src={url} alt="" width={size} height={size} referrerPolicy="no-referrer" />
  ) : (
    <span className="avatar-s letter" style={{ width: size, height: size, lineHeight: `${size - 4}px` }}>
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR');
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
