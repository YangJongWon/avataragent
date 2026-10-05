import { useState } from 'react';
import { siteApi, type ItemType, type Me } from '../api.ts';
import { Link, navigate } from '../router.tsx';
import { TYPE_LABEL } from './CommunityPage.tsx';

const HOW: Record<ItemType, { accept: string; text: string }> = {
  theme: { accept: '.zip', text: '앱의 테마 스튜디오에서 "내보내기"한 zip이나, theme.json이 든 폴더를 압축한 zip을 올려요. 같은 테마 id로 다시 올리면 새 버전이 돼요(themeVersion을 올려 주세요).' },
  flow: { accept: '.json', text: '앱의 업무 여정 편집 화면에서 "흐름 내보내기"로 받은 .flow.json 파일을 올려요. 담당 직원 대신 역할만 담겨요.' },
  playbook: { accept: '.json', text: '앱의 성과 탭에서 내보낸 플레이북 .json 파일을 올려요. 이름·업무 내용·키는 담기지 않아요.' },
};

const LICENSES = ['CC-BY-4.0', 'CC0-1.0', 'CC-BY-SA-4.0', 'MIT'];

export function UploadPage({ me, search }: { me: Me | null; search: string }) {
  const params = new URLSearchParams(search);
  const item = params.get('item') ?? '';
  const [type, setType] = useState<ItemType>((['theme', 'flow', 'playbook'] as const).find((t) => t === params.get('type')) ?? 'theme');
  const [file, setFile] = useState<File | null>(null);
  const [tags, setTags] = useState('');
  const [license, setLicense] = useState(LICENSES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!me) return <section className="page narrow">불러오는 중…</section>;
  if (!me.account) {
    return (
      <section className="page narrow">
        <h1>커뮤니티에 올리기</h1>
        <p>
          <Link href={`/login?next=${encodeURIComponent(`/community/upload${search}`)}`}>로그인</Link>하면 올릴 수 있어요.
        </p>
      </section>
    );
  }

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const result = await siteApi.upload(file, { type, item: item || undefined, tags, license: type === 'playbook' ? license : undefined });
      navigate(`/community/items/${result.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page narrow upload">
      <h1>{item ? '새 버전 올리기' : '커뮤니티에 올리기'}</h1>
      {!item && (
        <div className="tabs">
          {(Object.keys(TYPE_LABEL) as ItemType[]).map((t) => (
            <button key={t} className={type === t ? 'active' : ''} onClick={() => setType(t)}>
              {TYPE_LABEL[t].icon} {TYPE_LABEL[t].label}
            </button>
          ))}
        </div>
      )}
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="muted">{HOW[type].text}</p>
        <label>
          파일
          <input type="file" accept={HOW[type].accept} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <label>
          태그 <span className="muted small">(쉼표로 구분, 5개까지)</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="예: 아늑함, 겨울, 일러스트" />
        </label>
        {type === 'playbook' ? (
          <label>
            라이선스
            <select value={license} onChange={(e) => setLicense(e.target.value)}>
              {LICENSES.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        ) : (
          <p className="muted small">라이선스와 이름·설명은 파일 안의 값(theme.json의 license·name·description, 흐름의 license·name)을 써요.</p>
        )}
        <p className="muted small">
          올리면 앱과 같은 검사(파일 형식·크기·이미지·CSS 정리)를 거쳐 바로 공개돼요. 다른 사람의 저작물은 허락받은 것만 올려 주세요. 신고가 쌓이면 가려져요.
        </p>
        {error && <p className="error">{error}</p>}
        <button className="button" disabled={!file || busy}>
          {busy ? '검사하는 중…' : '올리기'}
        </button>
      </form>
    </section>
  );
}
