import { useEffect, useState } from 'react';
import { siteApi, type Category, type Me, type PostCard, type PostView } from '../api.ts';
import { ago, AuthorLink, Avatar, errorText, Markdown } from '../parts.tsx';
import { Link, navigate } from '../router.tsx';
import { SiteIcon, type SiteIconName } from '../components/SiteIcon.tsx';

export const CATEGORY: Record<Category, { icon: SiteIconName; label: string }> = {
  notice: { icon: 'notice', label: '공지' },
  question: { icon: 'question', label: '질문' },
  tip: { icon: 'tip', label: '팁' },
  idea: { icon: 'idea', label: '기능 제안' },
  showcase: { icon: 'office', label: '내 사무실 자랑' },
};

export function ForumPage({ search }: { search: string }) {
  const params = new URLSearchParams(search);
  const category = (params.get('category') ?? '') as Category | '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [posts, setPosts] = useState<PostCard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(search);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    navigate(`/forum${next.size ? `?${next}` : ''}`);
  };
  const query = (offset = 0) => {
    const out: Record<string, string> = { offset: String(offset) };
    if (category) out.category = category;
    if (params.get('q')) out.q = params.get('q')!;
    if (params.get('author')) out.author = params.get('author')!;
    return out;
  };

  useEffect(() => {
    setPosts(null);
    siteApi.posts(query()).then(
      (r) => {
        setPosts(r.posts);
        setTotal(r.total);
      },
      (e) => setError(errorText(e)),
    );
  }, [search]);

  return (
    <section className="page">
      <div className="row between">
        <h1>게시판</h1>
        <Link href={`/forum/new${category && category !== 'notice' ? `?category=${category}` : ''}`} className="button">
          <SiteIcon name="pen" />
          글쓰기
        </Link>
      </div>
      <p className="lead">질문하고, 팁을 나누고, 기능을 제안하고, 내 사무실을 자랑해요.</p>
      {params.get('author') && (
        <p>
          <b>@{params.get('author')}</b>의 글{' '}
          <button className="button small ghost" onClick={() => go({ author: '' })}>
            모든 글 보기
          </button>
        </p>
      )}
      <div className="gallery-bar">
        <div className="tabs">
          <button className={!category ? 'active' : ''} onClick={() => go({ category: '' })}>
            전체
          </button>
          {(Object.keys(CATEGORY) as Category[]).map((c) => (
            <button key={c} className={category === c ? 'active' : ''} onClick={() => go({ category: c })}>
              <SiteIcon name={CATEGORY[c].icon} /> {CATEGORY[c].label}
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목이나 내용으로 찾기" aria-label="찾기" />
        </form>
      </div>
      {error && <p className="error">{error}</p>}
      {posts === null && !error ? (
        <p className="muted">불러오는 중…</p>
      ) : posts?.length === 0 ? (
        <div className="card">
          <p className="muted">아직 글이 없어요. 첫 글을 남겨 보세요.</p>
        </div>
      ) : (
        <ul className="posts">
          {posts?.map((p) => (
            <li key={p.id} className={`card post-row${p.pinned ? ' pinned' : ''}`}>
              <div className="post-main">
                <div className="small muted">
                  {p.pinned && <SiteIcon name="pin" />}
                  <SiteIcon name={CATEGORY[p.category].icon} /> {CATEGORY[p.category].label}
                  {p.category === 'question' && (p.answered ? <span className="badge ok">해결됨</span> : <span className="badge">답변 기다림</span>)}
                </div>
                <Link href={`/forum/${p.id}`} className="post-title">
                  {p.title}
                </Link>
                {p.excerpt && <p className="muted small clamp">{p.excerpt}</p>}
                <div className="small muted row">
                  <Avatar url={p.author.avatarUrl} name={p.author.name} size={20} />
                  <AuthorLink author={p.author} />
                  <span>· {ago(p.lastActivityAt)}</span>
                </div>
              </div>
              <div className="post-count" title="댓글">
                <SiteIcon name="comment" /> {p.comments}
              </div>
            </li>
          ))}
        </ul>
      )}
      {posts && posts.length < total && (
        <p className="cta">
          <button
            className="button ghost"
            onClick={() => void siteApi.posts(query(posts.length)).then((r) => setPosts([...posts, ...r.posts]), (e) => setError(errorText(e)))}
          >
            더 보기 ({posts.length}/{total})
          </button>
        </p>
      )}
    </section>
  );
}

export function PostEditorPage({ me, search, editId }: { me: Me | null; search: string; editId?: string }) {
  const params = new URLSearchParams(search);
  const admin = me?.account?.role === 'admin';
  const initial = (params.get('category') ?? 'question') as Category;
  const [category, setCategory] = useState<Category>(initial in CATEGORY ? initial : 'question');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editId) return;
    siteApi.post(editId).then(
      (p) => {
        setCategory(p.category);
        setTitle(p.title);
        setBody(p.body);
      },
      (e) => setError(errorText(e)),
    );
  }, [editId]);

  if (!me) return <section className="page narrow">불러오는 중…</section>;
  if (!me.account) {
    return (
      <section className="page narrow">
        <h1>글쓰기</h1>
        <p>
          <Link href={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}>로그인</Link>하면 글을 쓸 수 있어요.
        </p>
      </section>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (editId) {
        await siteApi.editPost(editId, { title, body });
        navigate(`/forum/${editId}`);
      } else {
        const { id } = await siteApi.createPost({ category, title, body });
        navigate(`/forum/${id}`);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page narrow upload">
      <h1>{editId ? '글 고치기' : '글쓰기'}</h1>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {!editId && (
          <label>
            게시판
            <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {(Object.keys(CATEGORY) as Category[])
                .filter((c) => c !== 'notice' || admin)
                .map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY[c].label}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label>
          제목
          <input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="row between">
          <span>내용 <span className="muted small">(마크다운)</span></span>
          <button type="button" className="button small ghost" onClick={() => setPreview((p) => !p)}>
            {preview ? '쓰기' : '미리 보기'}
          </button>
        </div>
        {preview ? (
          <div className="preview-box">
            <Markdown text={body || '_(내용 없음)_'} />
          </div>
        ) : (
          <textarea
            rows={12}
            value={body}
            maxLength={20000}
            onChange={(e) => setBody(e.target.value)}
            placeholder={category === 'question' ? '어떤 상황인지, 무엇을 해 봤는지 적어 주면 답이 빨라요. 앱 버전과 화면 설명도 좋아요.' : ''}
          />
        )}
        {error && <p className="error">{error}</p>}
        <button className="button" disabled={busy || title.trim().length < 2 || !body.trim()}>
          {busy ? '올리는 중…' : editId ? '고치기' : '올리기'}
        </button>
      </form>
    </section>
  );
}

function CommentBox({ onSubmit, initial = '', label = '댓글 달기' }: { onSubmit: (body: string) => Promise<void>; initial?: string; label?: string }) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="comment-box"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void onSubmit(body.trim())
          .then(() => setBody(''))
          .finally(() => setBusy(false));
      }}
    >
      <textarea rows={4} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} placeholder="마크다운을 쓸 수 있어요." />
      <button className="button small" disabled={busy || !body.trim()}>
        {label}
      </button>
    </form>
  );
}

export function PostPage({ id, me }: { id: string; me: Me | null }) {
  const [post, setPost] = useState<PostView | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = () => siteApi.post(id).then(setPost, (e) => setError(errorText(e)));

  useEffect(() => {
    setPost(null);
    void load();
  }, [id, me?.account?.id]);

  const run = async (work: () => Promise<unknown>) => {
    setError('');
    setMessage('');
    try {
      await work();
    } catch (e) {
      setError(errorText(e));
      throw e;
    }
  };
  const report = (type: 'post' | 'comment', target: string) =>
    void run(async () => {
      if (!me?.account) return navigate(`/login?next=/forum/${id}`);
      const reason = window.prompt('어떤 문제가 있나요? (광고, 욕설, 위험한 내용 등)');
      if (!reason?.trim()) return;
      await siteApi.reportForum(type, target, reason);
      setMessage('신고했어요. 운영자가 확인할게요.');
    }).catch(() => {});

  if (!post) return <section className="page narrow">{error ? <p className="error">{error}</p> : <p className="muted">불러오는 중…</p>}</section>;
  const admin = me?.account?.role === 'admin';
  const accepted = post.comments.find((c) => c.accepted);
  const ordered = accepted ? [accepted, ...post.comments.filter((c) => c !== accepted)] : post.comments;
  return (
    <section className="page narrow post-page">
      <p className="small">
        <Link href={`/forum?category=${post.category}`}>
          ← <SiteIcon name={CATEGORY[post.category].icon} /> {CATEGORY[post.category].label}
        </Link>
      </p>
      <h1>
        {post.pinned && <SiteIcon name="pin" />}
        {post.title}
      </h1>
      <div className="row small muted">
        <Avatar url={post.author.avatarUrl} name={post.author.name} />
        <AuthorLink author={post.author} />
        <span>· {ago(post.createdAt)}</span>
        {post.editedAt && <span>· 고침</span>}
        {post.status !== 'published' && <span className="badge warn">숨김</span>}
      </div>
      {post.hiddenReason === 'reports' && <p className="error small">신고가 쌓여 가려졌어요. 운영자가 확인하면 다시 보여요.</p>}
      <article className="card">
        <Markdown text={post.body} />
      </article>
      <div className="row small">
        {post.canEdit && <Link href={`/forum/${post.id}/edit`}>고치기</Link>}
        {post.canEdit && (
          <button
            className="link-button"
            onClick={() =>
              void run(async () => {
                if (!window.confirm('이 글을 지울까요?')) return;
                await siteApi.removePost(post.id);
                navigate('/forum');
              }).catch(() => {})
            }
          >
            지우기
          </button>
        )}
        {admin && (
          <button className="link-button" onClick={() => void run(async () => setPost(await siteApi.pin(post.id, !post.pinned))).catch(() => {})}>
            {post.pinned ? '고정 풀기' : '맨 위에 고정'}
          </button>
        )}
        {!post.mine && post.status === 'published' && (
          <button className="link-button" onClick={() => report('post', post.id)}>
            신고
          </button>
        )}
      </div>

      <h2>댓글 {post.comments.length}</h2>
      {ordered.map((c) => (
        <div key={c.id} className={`card comment${c.accepted ? ' accepted' : ''}`}>
          <div className="row between small muted">
            <span className="row">
              <Avatar url={c.author.avatarUrl} name={c.author.name} size={22} />
              <AuthorLink author={c.author} />
              <span>· {ago(c.createdAt)}</span>
              {c.editedAt && <span>· 고침</span>}
              {c.accepted && <span className="badge ok">✔ 채택된 답변</span>}
              {c.status !== 'published' && <span className="badge warn">숨김</span>}
            </span>
            <span className="row">
              {post.canAccept && !c.mine && (
                <button className="link-button" onClick={() => void run(async () => setPost(await siteApi.accept(post.id, c.accepted ? null : c.id))).catch(() => {})}>
                  {c.accepted ? '채택 취소' : '이 답변 채택'}
                </button>
              )}
              {c.mine && (
                <button className="link-button" onClick={() => setEditing(editing === c.id ? null : c.id)}>
                  고치기
                </button>
              )}
              {(c.mine || admin) && (
                <button
                  className="link-button"
                  onClick={() =>
                    void run(async () => {
                      if (!window.confirm('댓글을 지울까요?')) return;
                      await siteApi.removeComment(c.id);
                      await load();
                    }).catch(() => {})
                  }
                >
                  지우기
                </button>
              )}
              {!c.mine && c.status === 'published' && (
                <button className="link-button" onClick={() => report('comment', c.id)}>
                  신고
                </button>
              )}
            </span>
          </div>
          {editing === c.id ? (
            <CommentBox
              initial={c.body}
              label="고치기"
              onSubmit={(body) =>
                run(async () => {
                  await siteApi.editComment(c.id, body);
                  setEditing(null);
                  await load();
                })
              }
            />
          ) : (
            <Markdown text={c.body} />
          )}
        </div>
      ))}
      {post.status === 'published' &&
        (me?.account ? (
          <CommentBox
            label={post.category === 'question' && !post.mine ? '답변 달기' : '댓글 달기'}
            onSubmit={(body) =>
              run(async () => {
                await siteApi.comment(post.id, body);
                await load();
              })
            }
          />
        ) : (
          <p>
            <Link href={`/login?next=/forum/${post.id}`}>로그인</Link>하면 댓글을 달 수 있어요.
          </p>
        ))}
      {message && <p className="pos small">{message}</p>}
      {error && <p className="error small">{error}</p>}
    </section>
  );
}
