import { useEffect, useState } from 'react';
import { t, tpl } from '../../../shared/i18n.ts';
import type { Playbook } from '../../../shared/playbook.ts';
import type { SavedFlow } from '../../../shared/types.ts';
import { api, type CommunityItem } from '../api.ts';
import './themes.css';

const TYPES: { id: CommunityItem['type'] | ''; label: string }[] = [
  { id: '', label: '전체' },
  { id: 'theme', label: '🎨 테마' },
  { id: 'flow', label: '🧭 업무 흐름' },
  { id: 'playbook', label: '📘 플레이북' },
];
const ICON: Record<CommunityItem['type'], string> = { theme: '🎨', flow: '🧭', playbook: '📘' };

function downloadPlaybook(playbook: Playbook) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(playbook, null, 2)], { type: 'application/json' }));
  link.download = `playbook-${playbook.team}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

interface Props {
  flows: SavedFlow[];
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}

/** Browse the project site's gallery and install with one click; the server does the fetching. */
export function CommunityTab({ flows, onError, onNotice }: Props) {
  const [type, setType] = useState<CommunityItem['type'] | ''>('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('popular');
  const [result, setResult] = useState<{ site: string; items: CommunityItem[]; total: number } | null>(null);
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setResult(null);
    setFailure('');
    const query: Record<string, string> = { sort, limit: '24' };
    if (type) query.type = type;
    if (search) query.q = search;
    api.communityItems(query).then(setResult, (e) => setFailure(e instanceof Error ? e.message : String(e)));
  }, [type, search, sort]);

  const install = async (item: CommunityItem) => {
    setBusy(item.id);
    try {
      const done = await api.communityInstall(item.id);
      if (done.type === 'theme') onNotice(tpl('"{name}" 테마를 설치했어요. 테마 탭에서 쓸 수 있어요.', { name: done.theme.name }));
      if (done.type === 'flow') onNotice(tpl('"{name}" 흐름을 저장했어요. 업무를 등록할 때 직접 설계에서 불러올 수 있어요.', { name: done.flow.flow.name }));
      if (done.type === 'playbook') {
        downloadPlaybook(done.playbook);
        onNotice(t('플레이북을 내려받았어요. 성과·개선 탭의 플레이북에서 가져오기로 적용하세요.'));
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const removeFlow = async (flow: SavedFlow) => {
    if (!window.confirm(tpl('"{name}" 흐름을 지울까요?', { name: flow.flow.name }))) return;
    try {
      await api.removeFlow(flow.id);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const installedFlow = (item: CommunityItem) => flows.some((f) => f.itemId === item.id);

  return (
    <section className="pixel-box section community-tab">
      <div className="row themes-head">
        <h3>{t('커뮤니티')}</h3>
        {result && (
          <div className="row">
            <a className="pixel-btn small" href={`${result.site}/community/upload`} target="_blank" rel="noreferrer">
              {t('내 것 올리기')}
            </a>
            <a className="pixel-btn small" href={`${result.site}/community`} target="_blank" rel="noreferrer">
              {t('사이트에서 보기')}
            </a>
          </div>
        )}
      </div>
      <p className="muted small">{t('다른 사람이 만든 테마·업무 흐름·플레이북을 둘러보고 바로 설치해요. 설치할 때 직접 가져올 때와 같은 검사를 거쳐요.')}</p>

      <div className="row community-bar">
        <div className="segmented" role="radiogroup" aria-label={t('종류')}>
          {TYPES.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={type === x.id} className={`segment ${type === x.id ? 'active' : ''}`} onClick={() => setType(x.id)}>
              {t(x.label)}
            </button>
          ))}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q.trim());
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('이름이나 설명으로 찾기')} aria-label={t('찾기')} />
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t('정렬')}>
            <option value="popular">{t('요즘 인기')}</option>
            <option value="new">{t('새로 올라온')}</option>
            <option value="downloads">{t('다운로드 많은')}</option>
          </select>
        </form>
      </div>

      {failure ? (
        <p className="neg small">{failure}</p>
      ) : result === null ? (
        <p className="muted small">{t('불러오는 중…')}</p>
      ) : result.items.length === 0 ? (
        <p className="muted small">{t('찾는 항목이 없어요.')}</p>
      ) : (
        <ul className="theme-grid">
          {result.items.map((item) => (
            <li key={item.id} className="theme-card">
              <div className="theme-preview">
                {item.preview ? <img src={`/api/community/items/${item.id}/preview`} alt="" loading="lazy" /> : <span className="theme-preview-builtin">{ICON[item.type]}</span>}
              </div>
              <div className="theme-body">
                <b>{item.title}</b>
                <div className="muted small">
                  {item.owner.handle ? `@${item.owner.handle}` : item.owner.name} · {item.license} · v{item.version}
                </div>
                {item.summary && <p className="small">{item.summary}</p>}
                <div className="muted small">
                  ♥ {item.likes} · ⬇ {item.downloads}
                  {item.verified && <span className="theme-badge">{t('검수 통과')}</span>}
                </div>
              </div>
              <div className="row theme-actions">
                {item.priceKrw > 0 ? (
                  <a className="pixel-btn small primary" href={`${result.site}/community/items/${item.id}`} target="_blank" rel="noreferrer">
                    {tpl('{price}원 · 사이트에서 사기', { price: item.priceKrw.toLocaleString('ko-KR') })}
                  </a>
                ) : (
                <button className="pixel-btn small primary" disabled={busy !== null} onClick={() => void install(item)}>
                  {busy === item.id
                    ? t('설치 중…')
                    : item.type === 'playbook'
                      ? t('내려받기')
                      : item.type === 'flow' && installedFlow(item)
                        ? t('다시 받기')
                        : t('설치')}
                </button>
                )}
                <a className="pixel-btn small" href={`${result.site}/community/items/${item.id}`} target="_blank" rel="noreferrer">
                  {t('자세히')}
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3>{t('저장한 업무 흐름')}</h3>
      {flows.length === 0 ? (
        <p className="muted small">{t('아직 없어요. 커뮤니티에서 받거나, 업무를 등록할 때 직접 설계한 여정을 흐름으로 저장할 수 있어요.')}</p>
      ) : (
        <ul className="saved-flows">
          {flows.map((f) => (
            <li key={f.id} className="row">
              <span>
                🧭 <b>{f.flow.name}</b>{' '}
                <span className="muted small">
                  {tpl('{n}단계', { n: String(f.flow.steps.length) })} · {f.source === 'community' ? t('커뮤니티') : f.source === 'file' ? t('파일') : t('직접 만듦')}
                </span>
              </span>
              <button className="pixel-btn small" onClick={() => void removeFlow(f)}>
                {t('지우기')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
