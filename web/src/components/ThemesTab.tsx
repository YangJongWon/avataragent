import { useEffect, useState } from 'react';
import { DEFAULT_THEME, THEME_LIMITS, type ThemeSummary } from '../../../shared/theme-pack.ts';
import { themeApi } from '../themeApi.ts';
import './themes.css';

/** The theme drawn in code ships with the app; it is listed like any installed theme. */
const PIXEL: ThemeSummary = {
  id: DEFAULT_THEME,
  themeVersion: '',
  name: '기본 픽셀',
  author: 'AI 에이전트 오피스',
  license: 'AGPL-3.0',
  description: '앱에 들어 있는 도트 사무실이에요. 테마가 없거나 불러오지 못하면 이 테마로 보여요.',
  preview: '',
  hasCss: false,
  characters: [],
};

interface Props {
  /** Only the owner installs or removes themes; everyone else just browses. */
  isOwner: boolean;
  /** The theme of the office being looked at, and how to switch it; omitted until offices carry a theme. */
  current?: string;
  onUse?: (themeId: string) => void;
  /** Whether the current theme's custom CSS is on in this office, and how to switch it. */
  cssOn?: boolean;
  onCssOn?: (on: boolean) => void;
  /** Opens the theme studio. */
  onMake?: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}

export function ThemesTab({ isOwner, current = DEFAULT_THEME, onUse, cssOn = true, onCssOn, onMake, onError, onNotice }: Props) {
  const [themes, setThemes] = useState<ThemeSummary[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    themeApi
      .list()
      .then(setThemes)
      .catch((e) => onError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    void load();
  }, []);

  const install = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > THEME_LIMITS.zipBytes) return onError(`테마 패키지는 ${THEME_LIMITS.zipBytes / 1024 / 1024}MB까지예요.`);
    setBusy(true);
    try {
      const theme = await themeApi.importZip(file);
      onNotice(`"${theme.name}" 테마를 설치했어요.${theme.hasCss ? ' 커스텀 CSS는 안전하게 정리해서 넣었어요.' : ''}`);
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (theme: ThemeSummary) => {
    if (!confirm(`"${theme.name}" 테마를 지울까요? 이 테마를 쓰던 사무실은 기본 픽셀로 보여요.`)) return;
    try {
      await themeApi.remove(theme.id);
      onNotice(`"${theme.name}" 테마를 지웠어요.`);
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="pixel-box section">
      <div className="row themes-head">
        <h3>테마</h3>
        <div className="row theme-actions-head">
          {onMake && (
            <button className="pixel-btn small" onClick={onMake}>
              테마 만들기
            </button>
          )}
          {isOwner && (
            <label className={`pixel-btn small primary${busy ? ' disabled' : ''}`}>
              {busy ? '설치 중…' : '테마 설치 (.zip)…'}
              <input type="file" accept=".zip,application/zip" hidden disabled={busy} onChange={(e) => void install(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
            </label>
          )}
        </div>
      </div>
      <p className="muted small">
        테마는 사무실 배경과 직원 캐릭터(기본 동작과 이벤트별 동작)를 바꿔요. 누구나 만들어 공유할 수 있고, 설치할 때 파일과 CSS를 검사해서 안전한 것만 넣어요.
      </p>

      {themes === null ? (
        <p className="muted small">불러오는 중…</p>
      ) : (
        <ul className="theme-grid">
          {[PIXEL, ...themes].map((theme) => {
            const builtIn = theme.id === DEFAULT_THEME;
            return (
              <li key={theme.id} className={`theme-card${theme.id === current ? ' current' : ''}`}>
                <div className="theme-preview">
                  {builtIn ? <span className="theme-preview-builtin">🏢</span> : <img src={themeApi.previewUrl(theme.id, theme.preview)} alt="" loading="lazy" />}
                </div>
                <div className="theme-body">
                  <b>{theme.name}</b>
                  <div className="muted small">
                    {theme.author || '작성자 없음'} · {theme.license}
                    {theme.themeVersion && ` · v${theme.themeVersion}`}
                  </div>
                  {theme.description && <p className="small">{theme.description}</p>}
                  {theme.characters.length > 0 && <div className="muted small">캐릭터: {theme.characters.map((c) => c.name).join(', ')}</div>}
                  {theme.hasCss && <span className="theme-badge">커스텀 CSS</span>}
                  {theme.hasCss && theme.id === current && onCssOn && (
                    <label className="toggle small">
                      <input type="checkbox" checked={cssOn} onChange={(e) => onCssOn(e.target.checked)} />
                      이 사무실에서 커스텀 CSS 쓰기
                    </label>
                  )}
                </div>
                <div className="row theme-actions">
                  {onUse &&
                    (theme.id === current ? (
                      <span className="muted small">사용 중</span>
                    ) : (
                      <button className="pixel-btn small" onClick={() => onUse(theme.id)}>
                        이 사무실에 쓰기
                      </button>
                    ))}
                  {!builtIn && (
                    <a className="pixel-btn small" href={themeApi.exportUrl(theme.id)} download>
                      내보내기
                    </a>
                  )}
                  {!builtIn && isOwner && (
                    <button className="pixel-btn small" onClick={() => void remove(theme)}>
                      지우기
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
