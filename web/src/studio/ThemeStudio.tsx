import { useMemo, useRef, useState } from 'react';
import { t, tpl } from '../../../shared/i18n.ts';
import { SITE_FONTS, TOKEN_NAMES, type Point, type Rect, type SiteFont, type ThemeState, type TokenName } from '../../../shared/theme-pack.ts';
import { mergeLayout } from '../office/theme.ts';
import { assetPath, buildPackage, checkDraft, emptyDraft, previewManifest, type StudioCharacter, type StudioDraft, type StudioImage, type StudioLayer } from './buildPackage.ts';
import { SheetEditor, stateLabel, STATE_GROUPS } from './SheetEditor.tsx';
import { ROLES, ROLE_LABEL, SPOT_LABEL, StudioPreview, type PlaceTarget } from './StudioPreview.tsx';
import './studio.css';

const LICENSES = ['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0', 'CC0-1.0', 'MIT'];
/** Korean labels are catalogue keys; they are shown through t(). */
const TOKEN_LABEL: Record<TokenName, string> = {
  ink: t('글자'),
  paper: t('종이'),
  bg: t('배경'),
  line: t('테두리'),
  accent: t('강조'),
  primary: t('주 버튼'),
  green: t('초록'),
  red: t('빨강'),
  blue: t('파랑'),
  yellow: t('노랑'),
  muted: t('흐린 글자'),
  surface: t('버튼·입력칸'),
  topbar: t('상단 바'),
  topbarInk: t('상단 바 글자'),
  topbarLine: t('상단 바 테두리'),
  tabBar: t('탭 줄'),
  tab: t('탭'),
  note: t('선택·메모'),
  hover: t('마우스 올림'),
};
const FONT_LABEL: Record<SiteFont, string> = { default: '기본 글꼴', rounded: '둥근 글꼴', serif: '명조', mono: '고정폭' };

const urls = new WeakMap<Uint8Array, string>();
const urlOf = (image: StudioImage) => {
  let url = urls.get(image.bytes);
  if (!url) {
    url = URL.createObjectURL(new Blob([image.bytes as BlobPart], { type: image.path.endsWith('.webp') ? 'image/webp' : 'image/png' }));
    urls.set(image.bytes, url);
  }
  return url;
};

/** PNG and WebP are kept as they are; anything else the browser can open is turned into PNG. */
async function readImage(file: File, taken: Iterable<string>): Promise<StudioImage> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(tpl('{name}은(는) 이미지로 열 수 없어요.', { name: file.name }));
  });
  const { width: w, height: h } = bitmap;
  if (file.type === 'image/png' || file.type === 'image/webp') {
    bitmap.close();
    return { path: assetPath(file.name, taken, file.type === 'image/webp' ? 'webp' : 'png'), bytes: new Uint8Array(await file.arrayBuffer()), w, h };
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error(tpl('{name}을(를) PNG로 바꾸지 못했어요.', { name: file.name }));
  return { path: assetPath(file.name, taken), bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
}

function download(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const targetKey = (tg: PlaceTarget | null) => (!tg ? '' : tg.kind === 'seat' || tg.kind === 'lounge' ? `${tg.kind}:${tg.role}` : tg.kind === 'spot' ? `spot:${tg.spot}` : 'door');

interface Props {
  /** Installs the finished package right away (owner only); without it the studio only downloads the zip. */
  onInstall?: (zip: Blob) => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}

/** Make a theme without writing JSON: drop in pictures, click where people sit, assign frames to states. */
export function ThemeStudio({ onInstall, onError, onNotice }: Props) {
  const [draft, setDraft] = useState<StudioDraft>(emptyDraft);
  const [characterIndex, setCharacterIndex] = useState(0);
  const [state, setState] = useState<ThemeState>('idle');
  const [target, setTarget] = useState<PlaceTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const capture = useRef<(() => Promise<Uint8Array>) | null>(null);

  const patch = (next: Partial<StudioDraft>) => setDraft((d) => ({ ...d, ...next }));
  const taken = () => [...draft.layers.map((l) => l.image.path), ...draft.characters.map((c) => c.sheet.path)];
  const images = useMemo(() => new Map([...draft.layers.map((l) => l.image), ...draft.characters.map((c) => c.sheet)].map((i) => [i.path, i])), [draft.layers, draft.characters]);
  const layout = useMemo(() => mergeLayout({ seats: draft.seats, lounge: draft.lounge, door: draft.door, spots: draft.spots }), [draft.seats, draft.lounge, draft.door, draft.spots]);
  const preview = useMemo(() => previewManifest(draft), [draft]);
  const check = checkDraft(draft);
  const character = draft.characters[characterIndex] as StudioCharacter | undefined;

  const fail = (e: unknown) => onError(e instanceof Error ? e.message : String(e));

  const addLayers = async (files: FileList | null) => {
    if (!files) return;
    try {
      const added: StudioLayer[] = [];
      for (const file of Array.from(files)) added.push({ image: await readImage(file, [...taken(), ...added.map((l) => l.image.path)]), x: 0, y: 0, front: false });
      setDraft((d) => ({ ...d, layers: [...d.layers, ...added] }));
    } catch (e) {
      fail(e);
    }
  };
  const updateLayer = (i: number, next: Partial<StudioLayer> | null) =>
    setDraft((d) => ({ ...d, layers: next ? d.layers.map((l, j) => (j === i ? { ...l, ...next } : l)) : d.layers.filter((_, j) => j !== i) }));
  const moveLayer = (i: number, by: number) =>
    setDraft((d) => {
      const layers = [...d.layers];
      const j = i + by;
      if (j < 0 || j >= layers.length) return d;
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...d, layers };
    });

  const addCharacter = async (file: File | undefined) => {
    if (!file) return;
    try {
      const sheet = await readImage(file, taken());
      const n = draft.characters.length + 1;
      const next: StudioCharacter = {
        id: `char-${n}`,
        name: tpl('캐릭터 {n}', { n }),
        sheet,
        frameW: sheet.w,
        frameH: sheet.h,
        scale: 1,
        anchor: { x: 0.5, y: 1 },
        head: { x: 0.5, y: 0 },
        states: {},
      };
      setDraft((d) => ({ ...d, characters: [...d.characters, next] }));
      setCharacterIndex(draft.characters.length);
      setState('idle');
    } catch (e) {
      fail(e);
    }
  };
  const updateCharacter = (next: Partial<StudioCharacter> | null) =>
    setDraft((d) => ({
      ...d,
      characters: next ? d.characters.map((c, i) => (i === characterIndex ? { ...c, ...next } : c)) : d.characters.filter((_, i) => i !== characterIndex),
    }));

  const place = (tg: PlaceTarget, value: Point | Rect) =>
    setDraft((d) => {
      if (tg.kind === 'door') return { ...d, door: value };
      if (tg.kind === 'spot') return { ...d, spots: { ...d.spots, [tg.spot]: value as Rect } };
      return tg.kind === 'seat' ? { ...d, seats: { ...d.seats, [tg.role]: value } } : { ...d, lounge: { ...d.lounge, [tg.role]: value } };
    });

  const finish = async (install: boolean) => {
    if (!capture.current) return onError(t('미리보기가 준비되면 다시 눌러 주세요.'));
    setBusy(true);
    try {
      const zip = buildPackage(draft, await capture.current());
      if (install && onInstall) {
        await onInstall(new Blob([zip as BlobPart], { type: 'application/zip' }));
        onNotice(tpl('"{name}" 테마를 설치했어요.', { name: draft.name }));
      } else {
        download(zip, `${draft.id}-${draft.themeVersion}.zip`);
        onNotice(t('테마 패키지를 내려받았어요. 커뮤니티에 올리거나 다른 사무실에서 설치할 수 있어요.'));
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const targets: { tg: PlaceTarget; label: string }[] = [
    ...ROLES.map((role) => ({ tg: { kind: 'seat', role } as PlaceTarget, label: tpl('{role} 좌석', { role: t(ROLE_LABEL[role]) }) })),
    ...ROLES.map((role) => ({ tg: { kind: 'lounge', role } as PlaceTarget, label: tpl('{role} 휴식', { role: t(ROLE_LABEL[role]) }) })),
    { tg: { kind: 'door' }, label: t('문') },
    ...(['board', 'shelf', 'safe', 'archive'] as const).map((spot) => ({ tg: { kind: 'spot', spot } as PlaceTarget, label: tpl('{spot} 영역', { spot: t(SPOT_LABEL[spot]) }) })),
  ];

  return (
    <div className="studio">
      <div className="studio-forms">
        <section className="pixel-box section">
          <h3>{t('1. 기본 정보')}</h3>
          <div className="studio-fields">
            <label>
              {t('이름')}
              <input value={draft.name} maxLength={60} onChange={(e) => patch({ name: e.target.value })} placeholder={t('아늑한 사무실')} />
            </label>
            <label title={t('영어 소문자·숫자·하이픈 2~40자. 같은 id로 다시 설치하면 덮어써요')}>
              id
              <input value={draft.id} maxLength={40} onChange={(e) => patch({ id: e.target.value.toLowerCase() })} placeholder="cozy-office" />
            </label>
            <label>
              {t('만든 사람')}
              <input value={draft.author} maxLength={60} onChange={(e) => patch({ author: e.target.value })} />
            </label>
            <label>
              {t('버전')}
              <input value={draft.themeVersion} maxLength={20} onChange={(e) => patch({ themeVersion: e.target.value })} />
            </label>
            <label>
              {t('라이선스')}
              <select value={draft.license} onChange={(e) => patch({ license: e.target.value })}>
                {LICENSES.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <label>
              {t('그림 느낌')}
              <select value={draft.scaleMode} onChange={(e) => patch({ scaleMode: e.target.value as StudioDraft['scaleMode'] })}>
                <option value="linear">{t('일러스트 (부드럽게)')}</option>
                <option value="nearest">{t('도트 (픽셀 그대로)')}</option>
              </select>
            </label>
          </div>
          <label className="studio-wide">
            {t('소개')}
            <textarea value={draft.description} maxLength={500} rows={2} onChange={(e) => patch({ description: e.target.value })} />
          </label>
        </section>

        <section className="pixel-box section">
          <h3>{t('2. 배경')}</h3>
          <p className="muted small">{t('사무실 화면은 1000×480이에요. 위에 있는 레이어가 먼저(뒤에) 그려지고, "앞" 레이어는 책상 앞판처럼 직원을 가려요.')}</p>
          <p className="muted small">{t('업무 공간과 휴게 공간 배경을 따로 올리고 각각 공간을 정해 주면, 팀 색은 업무 공간에만 입혀지고 직원은 두 공간 사이를 바로 오가요.')}</p>
          <label className="pixel-btn small">
            {t('이미지 추가…')}
            <input type="file" accept="image/*" multiple hidden onChange={(e) => void addLayers(e.target.files).finally(() => (e.target.value = ''))} />
          </label>
          <ul className="studio-layers">
            {draft.layers.map((layer, i) => (
              <li key={layer.image.path} className="row">
                <img src={urlOf(layer.image)} alt="" />
                <span className="small">
                  {layer.image.path.replace('assets/', '')} <span className="muted">({layer.image.w}×{layer.image.h})</span>
                </span>
                <label>
                  x <input type="number" value={layer.x} onChange={(e) => updateLayer(i, { x: Number(e.target.value) || 0 })} />
                </label>
                <label>
                  y <input type="number" value={layer.y} onChange={(e) => updateLayer(i, { y: Number(e.target.value) || 0 })} />
                </label>
                <label className="toggle">
                  <input type="checkbox" checked={layer.front} onChange={(e) => updateLayer(i, { front: e.target.checked })} />
                  {t('앞')}
                </label>
                <select value={layer.area ?? ''} onChange={(e) => updateLayer(i, { area: (e.target.value || undefined) as StudioLayer['area'] })} aria-label={t('공간')}>
                  <option value="">{t('공통')}</option>
                  <option value="work">{t('업무 공간')}</option>
                  <option value="lounge">{t('휴게 공간')}</option>
                </select>
                <button className="pixel-btn small" onClick={() => moveLayer(i, -1)} aria-label={t('위로')}>
                  ↑
                </button>
                <button className="pixel-btn small" onClick={() => moveLayer(i, 1)} aria-label={t('아래로')}>
                  ↓
                </button>
                <button className="pixel-btn small" onClick={() => updateLayer(i, null)}>
                  {t('빼기')}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="pixel-box section">
          <h3>{t('3. 자리 정하기')}</h3>
          <p className="muted small">{t('고른 다음 미리보기를 누르세요. 영역은 끌어서 그려요. 정하지 않은 자리는 기본 사무실 배치를 따라요.')}</p>
          <div className="studio-targets">
            {targets.map(({ tg, label }) => (
              <button key={targetKey(tg)} className={`state-chip${targetKey(tg) === targetKey(target) ? ' selected' : ''}`} onClick={() => setTarget(targetKey(tg) === targetKey(target) ? null : tg)}>
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="pixel-box section">
          <h3>{t('4. 캐릭터')}</h3>
          <p className="muted small">{t('스프라이트 시트(같은 크기 프레임을 격자로 붙인 그림)를 올리고, 동작마다 프레임을 눌러 넣으세요. "서 있기"만 있어도 동작해요.')}</p>
          <div className="row studio-characters">
            {draft.characters.map((c, i) => (
              <button key={c.sheet.path} className={`state-chip${i === characterIndex ? ' selected' : ''}`} onClick={() => setCharacterIndex(i)}>
                {c.name || c.id}
              </button>
            ))}
            <label className="pixel-btn small">
              {t('캐릭터 추가…')}
              <input type="file" accept="image/*" hidden onChange={(e) => void addCharacter(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
            </label>
          </div>
          {character && (
            <>
              <div className="row studio-fields">
                <label>
                  {t('이름')}
                  <input value={character.name} maxLength={40} onChange={(e) => updateCharacter({ name: e.target.value })} />
                </label>
                <label>
                  id
                  <input value={character.id} maxLength={40} onChange={(e) => updateCharacter({ id: e.target.value.toLowerCase() })} />
                </label>
                <button className="pixel-btn small" onClick={() => (updateCharacter(null), setCharacterIndex(0))}>
                  {t('캐릭터 빼기')}
                </button>
              </div>
              <SheetEditor character={character} sheetUrl={urlOf(character.sheet)} state={state} onState={setState} onChange={updateCharacter} />
            </>
          )}
        </section>

        <section className="pixel-box section">
          <h3>{t('5. 색과 CSS (선택)')}</h3>
          <div className="studio-tokens">
            {TOKEN_NAMES.map((name) => (
              <label key={name} className="toggle">
                <input
                  type="checkbox"
                  checked={name in draft.tokens}
                  onChange={(e) => {
                    const tokens = { ...draft.tokens };
                    if (e.target.checked) tokens[name] = '#888888';
                    else delete tokens[name];
                    patch({ tokens });
                  }}
                />
                {t(TOKEN_LABEL[name])}
                {name in draft.tokens && <input type="color" value={draft.tokens[name]} onChange={(e) => patch({ tokens: { ...draft.tokens, [name]: e.target.value } })} />}
              </label>
            ))}
          </div>
          <div className="row">
            <label>
              {t('글꼴')}{' '}
              <select value={draft.font} onChange={(e) => patch({ font: e.target.value as SiteFont })}>
                {SITE_FONTS.map((font) => (
                  <option key={font} value={font}>
                    {t(FONT_LABEL[font])}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('모서리 둥글기')}{' '}
              <input type="range" min={0} max={20} value={draft.radius} onChange={(e) => patch({ radius: Number(e.target.value) })} /> {draft.radius}px
            </label>
          </div>
          <label className="studio-wide">
            {t('커스텀 CSS')}
            <textarea
              value={draft.css}
              rows={4}
              spellCheck={false}
              onChange={(e) => patch({ css: e.target.value })}
              placeholder=".pixel-box { border-radius: 12px; }"
            />
          </label>
          <p className="muted small">{t('설치할 때 서버가 이 테마를 쓰는 사무실 안으로만 적용되게 정리해요. 외부 주소, 화면을 덮는 고정 배치, 승인·공유·결제 화면을 바꾸는 규칙은 빠져요.')}</p>
        </section>
      </div>

      <div className="studio-side">
        <section className="pixel-box section studio-sticky">
          <div className="row studio-preview-head">
            <h3>{t('미리보기')}</h3>
            <select value={state} onChange={(e) => setState(e.target.value as ThemeState)} aria-label={t('미리 볼 동작')}>
              {STATE_GROUPS.map((g) => (
                <optgroup key={g.label} label={t(g.label)}>
                  {g.states.map((s) => (
                    <option key={s.id} value={s.id}>
                      {t(s.label)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <StudioPreview manifest={preview} images={images} layout={layout} state={state} target={target} onPlace={place} onCapture={(c) => (capture.current = c)} />
          <p className="muted small">{tpl('모든 직원이 “{state}” 동작을 보여요. 없는 동작은 가까운 동작으로 대신 보여요.', { state: stateLabel(state) })}</p>
          {check.error ? <p className="neg small">{tpl('고칠 점: {reason}', { reason: check.error })}</p> : <p className="pos small">{t('내보낼 준비가 됐어요.')}</p>}
          <div className="row">
            <button className="pixel-btn small" disabled={busy || !!check.error} onClick={() => void finish(false)}>
              {t('zip 내려받기')}
            </button>
            {onInstall && (
              <button className="pixel-btn small primary" disabled={busy || !!check.error} onClick={() => void finish(true)}>
                {t('바로 설치')}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
