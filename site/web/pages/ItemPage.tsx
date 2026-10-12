import { useEffect, useState } from 'react';
import type { FlowPackStep } from '../../../shared/flow-pack.ts';
import { personalityOf } from '../../../shared/personality.ts';
import type { Playbook } from '../../../shared/playbook.ts';
import { TEAMS } from '../../../shared/teams.ts';
import type { Role, TeamId } from '../../../shared/types.ts';
import { formatProductUsd, productUnitsFromUsd, productUsdFromUnits } from '../../../shared/product-currency.ts';
import { siteApi, type ItemDetail, type Me } from '../api.ts';
import { Link, navigate } from '../router.tsx';
import { TYPE_LABEL } from './CommunityPage.tsx';
import { SiteIcon } from '../components/SiteIcon.tsx';
import { day, num, rich, t, tpl } from '../i18n.tsx';

const ROLE_LABEL: Record<Role, string> = { manager: '매니저', researcher: '리서처', writer: '작가', reviewer: '리뷰어' };
const TIER_LABEL: Record<number, string> = { 1: '가벼운 모델', 2: '표준 모델', 3: '고급 모델' };
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(n / 1024)}KB`);
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

function ThemeDetails({ details }: { details: Record<string, unknown> }) {
  const characters = (details.characters ?? []) as { id: string; name: string }[];
  return (
    <>
      <h2>{tpl('캐릭터 {n}명', { n: characters.length })}</h2>
      <p>{characters.map((c) => c.name).join(', ')}</p>
      <p className="muted small">
        {details.author ? `${tpl('만든 사람: {name}', { name: String(details.author) })} · ` : ''}
        {details.hasCss ? `${t('직접 만든 CSS 포함')} · ` : ''}
        {Number(details.variants) ? tpl('계절·기념일 변형 {n}개', { n: Number(details.variants) }) : t('변형 없음')}
      </p>
    </>
  );
}

function FlowDetails({ details }: { details: Record<string, unknown> }) {
  const steps = (details.steps ?? []) as FlowPackStep[];
  const team = details.team as TeamId | null;
  return (
    <>
      <h2>{tpl('업무 여정 {n}단계', { n: steps.length })}</h2>
      {team && TEAMS[team] && <p className="muted small">{tpl('{team}에서 만든 흐름이에요. 다른 팀에서도 쓸 수 있어요.', { team: t(TEAMS[team].name) })}</p>}
      <ol className="flow-steps">
        {steps.map((s, i) => (
          <li key={i}>
            <b>
              <SiteIcon name="flow" /> {s.label}
            </b>{' '}
            <span className="muted small">{s.role ? t(ROLE_LABEL[s.role]) : t('사용자')}</span>
            {s.instructions && <div className="small">{s.instructions}</div>}
            {s.loop && (
              <div className="small muted">
                ↩ {s.loop.when} → {s.loop.to === i ? t('이 단계 다시') : tpl('{step}(으)로', { step: steps[s.loop.to]?.label ?? '?' })} ({tpl('최대 {n}번', { n: s.loop.max })})
              </div>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}

function PlaybookDetails({ details }: { details: Record<string, unknown> }) {
  const staff = (details.staff ?? []) as Playbook['staff'];
  const stats = (details.stats ?? {}) as Playbook['stats'];
  const team = details.team as TeamId;
  return (
    <>
      <h2>{tpl('{team} 구성', { team: t(TEAMS[team]?.name ?? '') })}</h2>
      {staff.map((s) => (
        <div key={s.role} className="staff">
          <b>{t(ROLE_LABEL[s.role])}</b>{' '}
          <span className="muted small">
            <SiteIcon name="model" /> {t(personalityOf(s.personality).label)} · {t(TIER_LABEL[s.modelTierLook ?? (s.modelTier <= 1 ? 1 : s.modelTier >= 3 ? 3 : 2)])}
            {s.modelLabel ? ` (${s.modelLabel})` : ''}
          </span>
          {s.rules && <pre className="rules">{s.rules}</pre>}
        </div>
      ))}
      <h2>{t('성과')}</h2>
      <div className="stats">
        <div>
          <b>{stats.completedTasks}</b>
          <span>{t('완료한 업무')}</span>
        </div>
        <div>
          <b>{pct(stats.firstPassRate)}</b>
          <span>{t('첫 검토 통과')}</span>
        </div>
        <div>
          <b>{pct(stats.reviewPassRate)}</b>
          <span>{t('검토 통과')}</span>
        </div>
        <div>
          <b>{stats.costPerTaskKrw === null ? '—' : tpl('{n}원', { n: num(stats.costPerTaskKrw) })}</b>
          <span>{t('업무당 비용')}</span>
        </div>
      </div>
    </>
  );
}

function PriceEditor({ item, onSaved }: { item: ItemDetail; onSaved: (priceKrw: number) => void }) {
  const [price, setPrice] = useState(String(productUsdFromUnits(item.priceKrw)));
  const [error, setError] = useState('');
  const creator = productUnitsFromUsd(Number(price) * 0.7);
  return (
    <form
      className="row price-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError('');
        siteApi.setPrice(item.id, productUnitsFromUsd(Number(price) || 0)).then((r) => onSaved(r.priceKrw), (err) => setError(err instanceof Error ? err.message : String(err)));
      }}
    >
      <label className="small">
        {t('가격(USD, 0이면 무료)')}
        <input type="number" min={0} max={100} step={0.1} value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
      <button className="button small">{t('가격 저장')}</button>
      {Number(price) > 0 && <span className="muted small">{tpl('한 번 팔릴 때 내 몫 {price} (70%)', { price: formatProductUsd(creator) })}</span>}
      {error && <span className="error small">{error}</span>}
    </form>
  );
}

export function ItemPage({ id, me }: { id: string; me: Me | null }) {
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(() => (new URLSearchParams(location.search).get('bought') ? t('구매했어요. 이제 내려받을 수 있어요. 내 계정의 "구매한 테마"에도 남아요.') : ''));

  useEffect(() => {
    setItem(null);
    siteApi.item(id).then(setItem, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id, me?.account?.id]);

  const run = async (work: () => Promise<void>) => {
    setError('');
    setMessage('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const needLogin = () => {
    if (me?.account) return false;
    navigate(`/login?next=${encodeURIComponent(`/community/items/${id}`)}`);
    return true;
  };

  if (!item) return <section className="page narrow">{error ? <p className="error">{error}</p> : <p className="muted">{t('불러오는 중…')}</p>}</section>;
  const type = TYPE_LABEL[item.type];
  const admin = me?.account?.role === 'admin';
  return (
    <section className="page item-page">
      <p className="small">
        <Link href="/community">← {t('커뮤니티')}</Link>
      </p>
      <div className="item-head">
        {item.preview && <img className="item-preview" src={item.preview} alt="" />}
        <div>
          <div className="item-type">
            <SiteIcon name={type.icon} /> {t(type.label)}
            {item.verified && <span className="badge">{t('검수 통과')}</span>}
            {item.status && item.status !== 'published' && <span className="badge warn">{t('숨김')}</span>}
          </div>
          <h1>{item.title}</h1>
          {item.summary && <p className="lead">{item.summary}</p>}
          <p className="muted small">
            {item.owner.handle ? <Link href={`/u/${item.owner.handle}`}>@{item.owner.handle}</Link> : item.owner.name} · {t('버전')} {item.version} · {day(item.updatedAt)} · {t('라이선스')} <b>{item.license}</b>
          </p>
          <div className="tags">
            {item.tags.map((t) => (
              <Link key={t} href={`/community?tag=${encodeURIComponent(t)}`}>
                #{t}
              </Link>
            ))}
          </div>
          {item.priceKrw > 0 && (
            <p className="price">
              <b>{formatProductUsd(item.priceKrw)}</b> {item.owned && !item.mine && <span className="badge ok">{t('구매함')}</span>}
            </p>
          )}
          <div className="row">
            {item.owned ? (
              <a className="button" href={`/api/items/${item.id}/download`}>
                <SiteIcon name="download" /> {t('내려받기')}
              </a>
            ) : (
              <button
                className="button"
                onClick={() =>
                  void run(async () => {
                    if (needLogin()) return;
                    window.location.assign((await siteApi.buyItem(item.id)).url);
                  })
                }
              >
                {tpl('{price} 구매하기', { price: formatProductUsd(item.priceKrw) })}
              </button>
            )}
            <button
              className={`button ghost${item.liked ? ' liked' : ''}`}
              onClick={() =>
                void run(async () => {
                  if (needLogin()) return;
                  const r = await siteApi.like(item.id, !item.liked);
                  setItem({ ...item, liked: r.liked, likes: r.likes });
                })
              }
            >
              <SiteIcon name="heart" /> {item.likes}
            </button>
            <span className="muted small icon-stat"><SiteIcon name="download" /> {tpl('{n}회', { n: item.downloads })}</span>
          </div>
          <p className="muted small">
            {item.priceKrw > 0 ? (
              rich('유료 테마는 여기서 사고 내려받은 zip을 앱의 {tab} 탭 "테마 설치"로 넣어요.', { tab: <b>{t('테마')}</b> })
            ) : (
              rich('앱의 {tab} 탭에서 찾아 바로 설치할 수 있어요.', { tab: <b>{t('커뮤니티')}</b> })
            )}
            {item.type === 'playbook' && ` ${t('플레이북은 내려받아 앱의 성과 탭에서 가져오기로 적용해요.')}`}
          </p>
        </div>
      </div>

      {item.warnings.length > 0 && (
        <div className="card warn-card">
          <b>{t('확인해 주세요')}</b>
          <ul>
            {item.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        {item.type === 'theme' && <ThemeDetails details={item.details} />}
        {item.type === 'flow' && <FlowDetails details={item.details} />}
        {item.type === 'playbook' && <PlaybookDetails details={item.details} />}
      </div>

      <div className="card">
        <h2>{t('버전')}</h2>
        <table className="versions">
          <tbody>
            {item.versions.map((v) => (
              <tr key={v.version}>
                <td>
                  <b>{v.label}</b>
                </td>
                <td className="muted small">{day(v.createdAt)}</td>
                <td className="muted small">{kb(v.size)}</td>
                <td>{item.owned && <a href={`/api/items/${item.id}/download?v=${v.version}`}>{t('내려받기')}</a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(item.mine || admin) && (
        <div className="card">
          <h2>{item.mine ? t('내 항목 관리') : t('운영')}</h2>
          {item.hiddenReason === 'reports' && <p className="error small">{t('신고가 쌓여 가려졌어요. 운영자가 확인하면 다시 공개돼요.')}</p>}
          {item.mine && item.type === 'theme' && <PriceEditor item={item} onSaved={(priceKrw) => setItem({ ...item, priceKrw })} />}
          <div className="row">
            {item.mine && (
              <Link className="button small" href={`/community/upload?type=${item.type}&item=${item.id}`}>
                {t('새 버전 올리기')}
              </Link>
            )}
            {item.status === 'published' ? (
              <button className="button small ghost" onClick={() => void run(async () => setItem((await siteApi.setItemStatus(item.id, 'hidden')) as ItemDetail))}>
                {t('숨기기')}
              </button>
            ) : (
              <button className="button small ghost" onClick={() => void run(async () => setItem((await siteApi.setItemStatus(item.id, 'published')) as ItemDetail))}>
                {t('다시 공개')}
              </button>
            )}
            {admin && (
              <button className="button small ghost" onClick={() => void run(async () => setItem(await siteApi.setVerified(item.id, !item.verified)))}>
                {item.verified ? t('검수 표시 빼기') : t('검수 통과 표시')}
              </button>
            )}
            <button
              className="button small ghost danger"
              onClick={() =>
                void run(async () => {
                  if (!window.confirm(t('이 항목을 지울까요? 갤러리와 다운로드에서 사라지고 되돌릴 수 없어요.'))) return;
                  await siteApi.setItemStatus(item.id, 'removed');
                  navigate('/account');
                })
              }
            >
              {t('지우기')}
            </button>
          </div>
        </div>
      )}

      {!item.mine && item.status === 'published' && (
        <p className="small">
          <button
            className="link-button"
            onClick={() =>
              void run(async () => {
                if (needLogin()) return;
                const reason = window.prompt(t('어떤 문제가 있나요? (저작권 침해, 위험한 내용, 스팸 등)'));
                if (!reason?.trim()) return;
                await siteApi.report(item.id, reason);
                setMessage(t('신고했어요. 운영자가 확인할게요.'));
              })
            }
          >
            {t('신고하기')}
          </button>
        </p>
      )}
      {message && <p className="pos small">{message}</p>}
      {error && <p className="error small">{error}</p>}
    </section>
  );
}
