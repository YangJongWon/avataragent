import { useEffect, useState } from 'react';
import { siteApi, type ItemCard, type ItemType } from '../api.ts';
import { Link, navigate } from '../router.tsx';
import { SiteIcon, type SiteIconName } from '../components/SiteIcon.tsx';
import { formatProductUsd } from '../../../shared/product-currency.ts';

const TYPE_ICON: Record<ItemType, SiteIconName> = { theme: 'theme', flow: 'flow', playbook: 'playbook' };

export const TYPE_LABEL: Record<ItemType, { icon: string; label: string }> = {
  theme: { icon: '🎨', label: '테마' },
  flow: { icon: '🧭', label: '업무 흐름' },
  playbook: { icon: '📘', label: '플레이북' },
};

const SORTS: [string, string][] = [
  ['popular', '요즘 인기'],
  ['new', '새로 올라온'],
  ['downloads', '다운로드 많은'],
];
const PAGE = 24;

export function ItemCardView({ item }: { item: ItemCard }) {
  const type = TYPE_LABEL[item.type];
  return (
    <Link href={`/community/items/${item.id}`} className="card item-card">
      <div className="item-thumb">{item.preview ? <img src={item.preview} alt="" loading="lazy" /> : <span className="empty-art"><SiteIcon name={TYPE_ICON[item.type]} /></span>}</div>
      <div className="item-body">
        <div className="item-type">
          <SiteIcon name={TYPE_ICON[item.type]} /> {type.label}
          {item.verified && <span className="badge">검수 통과</span>}
          {item.status && item.status !== 'published' && <span className="badge warn">{item.status === 'hidden' ? '숨김' : item.status}</span>}
          <span className={`price-tag${item.priceKrw ? ' paid' : ''}`}>{item.priceKrw ? formatProductUsd(item.priceKrw) : '무료'}</span>
        </div>
        <h3>{item.title}</h3>
        {item.summary && <p className="muted small clamp">{item.summary}</p>}
        <div className="item-meta small muted">
          <span>{item.owner.handle ? `@${item.owner.handle}` : item.owner.name}</span>
          <span>♥ {item.likes}</span>
          <span>⬇ {item.downloads}</span>
        </div>
      </div>
    </Link>
  );
}

export function CommunityPage({ search }: { search: string }) {
  const params = new URLSearchParams(search);
  const type = (params.get('type') ?? '') as ItemType | '';
  const sort = params.get('sort') ?? 'popular';
  const tag = params.get('tag') ?? '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [items, setItems] = useState<ItemCard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(search);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    navigate(`/community${next.size ? `?${next}` : ''}`);
  };

  useEffect(() => {
    setItems(null);
    setError('');
    const query: Record<string, string> = { sort, limit: String(PAGE) };
    if (type) query.type = type;
    if (tag) query.tag = tag;
    if (params.get('q')) query.q = params.get('q')!;
    siteApi.items(query).then(
      (r) => {
        setItems(r.items);
        setTotal(r.total);
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [search]);

  const more = async () => {
    const query: Record<string, string> = { sort, limit: String(PAGE), offset: String(items?.length ?? 0) };
    if (type) query.type = type;
    if (tag) query.tag = tag;
    if (params.get('q')) query.q = params.get('q')!;
    const r = await siteApi.items(query);
    setItems((list) => [...(list ?? []), ...r.items]);
  };

  return (
    <section className="page">
      <div className="row between">
        <h1>커뮤니티</h1>
        <Link href={`/community/upload${type ? `?type=${type}` : ''}`} className="button">
          <SiteIcon name="upload" />
          올리기
        </Link>
      </div>
      <p className="lead">사무실 테마, 업무 흐름, 플레이북을 나눠요. 앱의 커뮤니티 탭에서 바로 설치할 수도 있어요.</p>

      <div className="gallery-bar">
        <div className="tabs">
          <button className={!type ? 'active' : ''} onClick={() => go({ type: '' })}>
            전체
          </button>
          {(Object.keys(TYPE_LABEL) as ItemType[]).map((t) => (
            <button key={t} className={type === t ? 'active' : ''} onClick={() => go({ type: t })}>
              <SiteIcon name={TYPE_ICON[t]} /> {TYPE_LABEL[t].label}
            </button>
          ))}
        </div>
        <form
          className="row search"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: q.trim() });
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름이나 설명으로 찾기" aria-label="찾기" />
          <select value={sort} onChange={(e) => go({ sort: e.target.value })} aria-label="정렬">
            {SORTS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </form>
      </div>
      {tag && (
        <p>
          태그 <b>#{tag}</b>{' '}
          <button className="button small ghost" onClick={() => go({ tag: '' })}>
            태그 지우기
          </button>
        </p>
      )}

      {error && <p className="error">{error}</p>}
      {items === null && !error ? (
        <p className="muted">불러오는 중…</p>
      ) : items?.length === 0 ? (
        <div className="card">
          <p className="muted">
            {params.get('q') || tag ? '찾는 항목이 없어요.' : '아직 올라온 항목이 없어요. 첫 번째로 올려 보세요!'} <Link href="/docs/theme-guide">테마 만들기 가이드</Link>
          </p>
        </div>
      ) : (
        <div className="gallery">{items?.map((item) => <ItemCardView key={item.id} item={item} />)}</div>
      )}
      {items && items.length < total && (
        <p className="cta">
          <button className="button ghost" onClick={() => void more()}>
            더 보기 ({items.length}/{total})
          </button>
        </p>
      )}
    </section>
  );
}
