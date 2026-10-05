import { useEffect, useState } from 'react';
import { siteApi, type Me, type Profile, type RankRow } from '../api.ts';
import { Avatar, errorText } from '../parts.tsx';
import { Link, navigate } from '../router.tsx';
import { ItemCardView } from './CommunityPage.tsx';

const PERIODS: [string, string][] = [
  ['week', '이번 주'],
  ['month', '이번 달'],
  ['all', '전체'],
];

export function RankingPage({ search }: { search: string }) {
  const period = new URLSearchParams(search).get('period') ?? 'month';
  const [rows, setRows] = useState<RankRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(null);
    siteApi.ranking(period).then(setRows, (e) => setError(errorText(e)));
  }, [period]);

  return (
    <section className="page narrow">
      <h1>크리에이터 랭킹</h1>
      <p className="lead">올린 테마·흐름·플레이북이 받은 다운로드와 좋아요(좋아요 1개 = 다운로드 3회)로 매겨요.</p>
      <div className="tabs">
        {PERIODS.map(([id, label]) => (
          <button key={id} className={period === id ? 'active' : ''} onClick={() => navigate(`/ranking?period=${id}`)}>
            {label}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {rows === null && !error ? (
        <p className="muted">불러오는 중…</p>
      ) : rows?.length === 0 ? (
        <div className="card">
          <p className="muted">
            이 기간에는 아직 순위가 없어요. <Link href="/community/upload">첫 항목을 올려</Link> 보세요.
          </p>
        </div>
      ) : (
        <ol className="ranking">
          {rows?.map((r, i) => (
            <li key={r.handle} className={`card rank-row${i < 3 ? ` top top-${i + 1}` : ''}`}>
              <span className="rank-no">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
              <Avatar url={r.avatarUrl} name={r.name} size={40} />
              <span className="rank-who">
                <Link href={`/u/${r.handle}`}>
                  <b>{r.name || r.handle}</b>
                </Link>
                <span className="muted small">
                  @{r.handle} · 항목 {r.items}개
                </span>
              </span>
              <span className="rank-score">
                <b>{r.score.toLocaleString()}</b>
                <span className="muted small">
                  ⬇ {r.downloads} · ♥ {r.likes}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ProfileEditor({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const [handle, setHandle] = useState(profile.handle);
  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio);
  const [links, setLinks] = useState([...profile.links, '', '', ''].slice(0, 3));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="card upload"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        siteApi
          .updateProfile({ handle, name, bio, links: links.filter((l) => l.trim()) })
          .then((p) => {
            onSaved(p);
            if (p.handle !== profile.handle) navigate(`/u/${p.handle}`);
          }, (err) => setError(errorText(err)))
          .finally(() => setBusy(false));
      }}
    >
      <label>
        아이디 <span className="muted small">(주소 /u/아이디, 영어 소문자·숫자·_·-)</span>
        <input value={handle} maxLength={24} onChange={(e) => setHandle(e.target.value)} />
      </label>
      <label>
        이름
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        소개
        <textarea rows={3} value={bio} maxLength={300} onChange={(e) => setBio(e.target.value)} />
      </label>
      <label>링크 (https://, 3개까지)</label>
      {links.map((l, i) => (
        <input key={i} className="link-input" value={l} placeholder="https://" onChange={(e) => setLinks(links.map((x, j) => (j === i ? e.target.value : x)))} />
      ))}
      {error && <p className="error">{error}</p>}
      <button className="button" disabled={busy}>
        저장
      </button>
    </form>
  );
}

export function ProfilePage({ handle, me }: { handle: string; me: Me | null }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setProfile(null);
    setError('');
    siteApi.user(handle).then(setProfile, (e) => setError(errorText(e)));
  }, [handle, me?.account?.id]);

  if (!profile) return <section className="page narrow">{error ? <p className="error">{error}</p> : <p className="muted">불러오는 중…</p>}</section>;
  return (
    <section className="page">
      <div className="profile-head">
        <Avatar url={profile.avatarUrl} name={profile.name || profile.handle} size={88} />
        <div>
          <h1>{profile.name || profile.handle}</h1>
          <div className="muted">
            @{profile.handle} · {new Date(profile.joinedAt).toLocaleDateString('ko-KR')} 가입
            {profile.suspended && <span className="badge warn">정지됨</span>}
          </div>
          {profile.bio && <p>{profile.bio}</p>}
          <div className="tags">
            {profile.links.map((l) => (
              <a key={l} href={l} target="_blank" rel="noopener noreferrer nofollow">
                {new URL(l).host}
              </a>
            ))}
          </div>
          <div className="badges">
            {profile.badges.map((b) => (
              <span key={b.id} className="badge-pill" title={b.label}>
                {b.icon} {b.label}
              </span>
            ))}
          </div>
          {profile.mine && (
            <button className="button small ghost" onClick={() => setEditing((e) => !e)}>
              {editing ? '닫기' : '프로필 고치기'}
            </button>
          )}
        </div>
      </div>
      {editing && (
        <ProfileEditor
          profile={profile}
          onSaved={(p) => {
            setProfile(p);
            setEditing(false);
          }}
        />
      )}
      <div className="stats profile-stats">
        <div>
          <b>{profile.totals.items}</b>
          <span>올린 항목</span>
        </div>
        <div>
          <b>{profile.totals.downloads.toLocaleString()}</b>
          <span>다운로드</span>
        </div>
        <div>
          <b>{profile.totals.likes.toLocaleString()}</b>
          <span>좋아요</span>
        </div>
        <div>
          <b>{profile.monthRank ? `${profile.monthRank}위` : '—'}</b>
          <span>이번 달 순위</span>
        </div>
        <div>
          <b>{profile.totals.posts}</b>
          <span>게시글</span>
        </div>
      </div>
      <h2>올린 항목</h2>
      {profile.items.length === 0 ? <p className="muted">아직 공개한 항목이 없어요.</p> : <div className="gallery">{profile.items.map((item) => <ItemCardView key={item.id} item={item} />)}</div>}
      {profile.totals.posts > 0 && (
        <p>
          <Link href={`/forum?author=${profile.handle}`}>게시글 보기 →</Link>
        </p>
      )}
    </section>
  );
}
