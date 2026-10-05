import { useEffect, useState } from 'react';
import type { FlowPackStep } from '../../../shared/flow-pack.ts';
import { personalityOf } from '../../../shared/personality.ts';
import type { Playbook } from '../../../shared/playbook.ts';
import { TEAMS } from '../../../shared/teams.ts';
import type { Role, TeamId } from '../../../shared/types.ts';
import { STEP_KIND } from '../../../shared/workflow.ts';
import { siteApi, type ItemDetail, type Me } from '../api.ts';
import { Link, navigate } from '../router.tsx';
import { TYPE_LABEL } from './CommunityPage.tsx';

const ROLE_LABEL: Record<Role, string> = { manager: '매니저', researcher: '리서처', writer: '작가', reviewer: '리뷰어' };
const TIER_LABEL: Record<number, string> = { 1: '가벼운 모델', 2: '표준 모델', 3: '고급 모델' };
const day = (iso: string) => new Date(iso).toLocaleDateString('ko-KR');
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(n / 1024)}KB`);
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

function ThemeDetails({ details }: { details: Record<string, unknown> }) {
  const characters = (details.characters ?? []) as { id: string; name: string }[];
  return (
    <>
      <h2>캐릭터 {characters.length}명</h2>
      <p>{characters.map((c) => c.name).join(', ')}</p>
      <p className="muted small">
        {details.author ? `만든 사람: ${String(details.author)} · ` : ''}
        {details.hasCss ? '직접 만든 CSS 포함 · ' : ''}
        {Number(details.variants) ? `계절·기념일 변형 ${Number(details.variants)}개` : '변형 없음'}
      </p>
    </>
  );
}

function FlowDetails({ details }: { details: Record<string, unknown> }) {
  const steps = (details.steps ?? []) as FlowPackStep[];
  const team = details.team as TeamId | null;
  return (
    <>
      <h2>업무 여정 {steps.length}단계</h2>
      {team && TEAMS[team] && <p className="muted small">{TEAMS[team].name}에서 만든 흐름이에요. 다른 팀에서도 쓸 수 있어요.</p>}
      <ol className="flow-steps">
        {steps.map((s, i) => (
          <li key={i}>
            <b>
              {STEP_KIND[s.kind].icon} {s.label}
            </b>{' '}
            <span className="muted small">{s.role ? ROLE_LABEL[s.role] : '사용자'}</span>
            {s.instructions && <div className="small">{s.instructions}</div>}
            {s.loop && (
              <div className="small muted">
                ↩ {s.loop.when} → {s.loop.to === i ? '이 단계 다시' : `${steps[s.loop.to]?.label ?? '?'}(으)로`} (최대 {s.loop.max}번)
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
      <h2>{TEAMS[team]?.name ?? ''} 구성</h2>
      {staff.map((s) => (
        <div key={s.role} className="staff">
          <b>{ROLE_LABEL[s.role]}</b>{' '}
          <span className="muted small">
            {personalityOf(s.personality).emoji} {personalityOf(s.personality).label} · {TIER_LABEL[s.modelTier]}
            {s.modelLabel ? ` (${s.modelLabel})` : ''}
          </span>
          {s.rules && <pre className="rules">{s.rules}</pre>}
        </div>
      ))}
      <h2>성과</h2>
      <div className="stats">
        <div>
          <b>{stats.completedTasks}</b>
          <span>완료한 업무</span>
        </div>
        <div>
          <b>{pct(stats.firstPassRate)}</b>
          <span>첫 검토 통과</span>
        </div>
        <div>
          <b>{pct(stats.reviewPassRate)}</b>
          <span>검토 통과</span>
        </div>
        <div>
          <b>{stats.costPerTaskKrw === null ? '—' : `${stats.costPerTaskKrw.toLocaleString()}원`}</b>
          <span>업무당 비용</span>
        </div>
      </div>
    </>
  );
}

export function ItemPage({ id, me }: { id: string; me: Me | null }) {
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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

  if (!item) return <section className="page narrow">{error ? <p className="error">{error}</p> : <p className="muted">불러오는 중…</p>}</section>;
  const type = TYPE_LABEL[item.type];
  const admin = me?.account?.role === 'admin';
  return (
    <section className="page item-page">
      <p className="small">
        <Link href="/community">← 커뮤니티</Link>
      </p>
      <div className="item-head">
        {item.preview && <img className="item-preview" src={item.preview} alt="" />}
        <div>
          <div className="item-type">
            {type.icon} {type.label}
            {item.verified && <span className="badge">검수 통과</span>}
            {item.status && item.status !== 'published' && <span className="badge warn">숨김</span>}
          </div>
          <h1>{item.title}</h1>
          {item.summary && <p className="lead">{item.summary}</p>}
          <p className="muted small">
            {item.owner.handle ? `@${item.owner.handle}` : item.owner.name} · 버전 {item.version} · {day(item.updatedAt)} · 라이선스 <b>{item.license}</b>
          </p>
          <div className="tags">
            {item.tags.map((t) => (
              <Link key={t} href={`/community?tag=${encodeURIComponent(t)}`}>
                #{t}
              </Link>
            ))}
          </div>
          <div className="row">
            <a className="button" href={`/api/items/${item.id}/download`}>
              ⬇ 내려받기
            </a>
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
              {item.liked ? '♥' : '♡'} {item.likes}
            </button>
            <span className="muted small">⬇ {item.downloads}회</span>
          </div>
          <p className="muted small">
            앱의 <b>커뮤니티</b> 탭에서 찾아 바로 설치할 수 있어요.
            {item.type === 'playbook' && ' 플레이북은 내려받아 앱의 성과 탭에서 가져오기로 적용해요.'}
          </p>
        </div>
      </div>

      {item.warnings.length > 0 && (
        <div className="card warn-card">
          <b>확인해 주세요</b>
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
        <h2>버전</h2>
        <table className="versions">
          <tbody>
            {item.versions.map((v) => (
              <tr key={v.version}>
                <td>
                  <b>{v.label}</b>
                </td>
                <td className="muted small">{day(v.createdAt)}</td>
                <td className="muted small">{kb(v.size)}</td>
                <td>
                  <a href={`/api/items/${item.id}/download?v=${v.version}`}>내려받기</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(item.mine || admin) && (
        <div className="card">
          <h2>{item.mine ? '내 항목 관리' : '운영'}</h2>
          {item.hiddenReason === 'reports' && <p className="error small">신고가 쌓여 가려졌어요. 운영자가 확인하면 다시 공개돼요.</p>}
          <div className="row">
            {item.mine && (
              <Link className="button small" href={`/community/upload?type=${item.type}&item=${item.id}`}>
                새 버전 올리기
              </Link>
            )}
            {item.status === 'published' ? (
              <button className="button small ghost" onClick={() => void run(async () => setItem((await siteApi.setItemStatus(item.id, 'hidden')) as ItemDetail))}>
                숨기기
              </button>
            ) : (
              <button className="button small ghost" onClick={() => void run(async () => setItem((await siteApi.setItemStatus(item.id, 'published')) as ItemDetail))}>
                다시 공개
              </button>
            )}
            {admin && (
              <button className="button small ghost" onClick={() => void run(async () => setItem(await siteApi.setVerified(item.id, !item.verified)))}>
                {item.verified ? '검수 표시 빼기' : '검수 통과 표시'}
              </button>
            )}
            <button
              className="button small ghost danger"
              onClick={() =>
                void run(async () => {
                  if (!window.confirm('이 항목을 지울까요? 갤러리와 다운로드에서 사라지고 되돌릴 수 없어요.')) return;
                  await siteApi.setItemStatus(item.id, 'removed');
                  navigate('/account');
                })
              }
            >
              지우기
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
                const reason = window.prompt('어떤 문제가 있나요? (저작권 침해, 위험한 내용, 스팸 등)');
                if (!reason?.trim()) return;
                await siteApi.report(item.id, reason);
                setMessage('신고했어요. 운영자가 확인할게요.');
              })
            }
          >
            신고하기
          </button>
        </p>
      )}
      {message && <p className="pos small">{message}</p>}
      {error && <p className="error small">{error}</p>}
    </section>
  );
}
