import { useEffect, useState } from 'react';
import { currentLanguage, t, tpl } from '../../../shared/i18n.ts';
import { characterName, DEFAULT_THEME, THEME_BOOKINGS_MAX, THEME_LIMITS, type ThemeBooking, type ThemeSummary } from '../../../shared/theme-pack.ts';
import { inDates } from '../../../shared/theme-rules.ts';
import { themeApi } from '../themeApi.ts';
import { forgetThemeManifests } from '../useThemePack.ts';
import './themes.css';

/** The theme drawn in code ships with the app; it is listed like any installed theme. */
const PIXEL: ThemeSummary = {
  id: DEFAULT_THEME,
  themeVersion: '',
  name: '기본 픽셀',
  author: 'AvatarCast',
  license: 'AGPL-3.0',
  description: '앱에 들어 있는 도트 사무실이에요. 테마가 없거나 불러오지 못하면 이 테마로 보여요.',
  preview: '',
  hasCss: false,
  characters: [],
};

interface Props {
  /** Only the owner installs or removes themes; everyone else just browses. */
  isOwner: boolean;
  /** The theme every office shows unless it picked its own; only the owner switches it. */
  companyTheme: string;
  onUseCompany?: (themeId: string) => void;
  /** Company themes booked for seasons; only the owner changes them. */
  bookings: ThemeBooking[];
  onBook?: (bookings: ThemeBooking[]) => Promise<void>;
  /** The theme for the page around the offices, null when it follows the office being viewed; only the owner switches it. */
  siteTheme: string | null;
  onUseSite?: (themeId: string | null) => void;
  /** The office being looked at, its own theme if it picked one, and how to pick one or go back (null) to the shared one. */
  officeName: string;
  ownTheme?: string;
  onUseOffice?: (themeId: string | null) => void;
  /** Whether the current theme's custom CSS is on in this office, and how to switch it. */
  cssOn?: boolean;
  onCssOn?: (on: boolean) => void;
  /** Opens the theme studio. */
  onMake?: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}

export function ThemesTab({ isOwner, companyTheme, onUseCompany, bookings, onBook, siteTheme, onUseSite, officeName, ownTheme, onUseOffice, cssOn = true, onCssOn, onMake, onError, onNotice }: Props) {
  const current = ownTheme ?? companyTheme;
  const [themes, setThemes] = useState<ThemeSummary[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    themeApi
      .list()
      .finally(forgetThemeManifests)
      .then(setThemes)
      .catch((e) => onError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    void load();
  }, []);

  const install = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > THEME_LIMITS.zipBytes) return onError(tpl('테마 패키지는 {n}MB까지예요.', { n: THEME_LIMITS.zipBytes / 1024 / 1024 }));
    setBusy(true);
    try {
      const theme = await themeApi.importZip(file);
      onNotice(
        theme.hasCss
          ? tpl('"{name}" 테마를 설치했어요. 커스텀 CSS는 안전하게 정리해서 넣었어요.', { name: theme.name })
          : tpl('"{name}" 테마를 설치했어요.', { name: theme.name }),
      );
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (theme: ThemeSummary) => {
    if (!confirm(tpl('"{name}" 테마를 지울까요? 이 테마를 쓰던 사무실은 기본 픽셀로 보여요.', { name: theme.name }))) return;
    try {
      await themeApi.remove(theme.id);
      onNotice(tpl('"{name}" 테마를 지웠어요.', { name: theme.name }));
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="pixel-box section">
      <div className="row themes-head">
        <h3>{t('테마')}</h3>
        <div className="row theme-actions-head">
          {onMake && (
            <button className="pixel-btn small" onClick={onMake}>
              {t('테마 만들기')}
            </button>
          )}
          {isOwner && (
            <label className={`pixel-btn small primary${busy ? ' disabled' : ''}`}>
              {busy ? t('설치 중…') : t('테마 설치 (.zip)…')}
              <input type="file" accept=".zip,application/zip" hidden disabled={busy} onChange={(e) => void install(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
            </label>
          )}
        </div>
      </div>
      <p className="muted small">
        {t('테마는 사무실 배경과 직원 캐릭터(기본 동작과 이벤트별 동작)를 바꿔요. 누구나 만들어 공유할 수 있고, 설치할 때 파일과 CSS를 검사해서 안전한 것만 넣어요.')}
      </p>
      <p className="muted small">
        {t('테마는 모든 사무실이 함께 써요. 특정 사무실만 다르게 꾸미고 싶을 때는 "이 사무실만 쓰기"를 눌러요.')}
      </p>
      {ownTheme && (
        <div className="row theme-own-note small">
          <span>{tpl('{name}은(는) 공통 테마 대신 따로 고른 테마를 쓰고 있어요.', { name: officeName })}</span>
          {onUseOffice && (
            <button className="pixel-btn small" onClick={() => onUseOffice(null)}>
              {t('공통 테마 따르기')}
            </button>
          )}
        </div>
      )}
      <div className="row theme-own-note small">
        <span>
          {siteTheme === null
            ? t('상단 바, 탭, 패널 같은 사이트 화면은 보고 있는 사무실의 테마를 따라요.')
            : tpl('사이트 화면은 "{theme}" 테마로 고정돼 있어요.', { theme: siteThemeName(siteTheme, themes) })}
        </span>
        {siteTheme !== null && onUseSite && (
          <button className="pixel-btn small" onClick={() => onUseSite(null)}>
            {t('사무실 테마 따르기')}
          </button>
        )}
      </div>

      {themes === null ? (
        <p className="muted small">{t('불러오는 중…')}</p>
      ) : (
        <ul className="theme-grid">
          {[PIXEL, ...themes].map((theme) => {
            const builtIn = theme.id === DEFAULT_THEME;
            const name = builtIn ? t(theme.name) : theme.name;
            const description = builtIn ? t(theme.description) : theme.description;
            return (
              <li key={theme.id} className={`theme-card${theme.id === current ? ' current' : ''}`}>
                <div className="theme-preview">
                  {builtIn ? <span className="theme-preview-builtin">🏢</span> : <img src={themeApi.previewUrl(theme.id, theme.preview)} alt="" loading="lazy" />}
                </div>
                <div className="theme-body">
                  <b>{name}</b>
                  <div className="muted small">
                    {(builtIn ? t(theme.author) : theme.author) || t('작성자 없음')} · {theme.license}
                    {theme.themeVersion && ` · v${theme.themeVersion}`}
                  </div>
                  {description && <p className="small">{description}</p>}
                  {theme.characters.length > 0 && (
                    <div className="muted small">{tpl('캐릭터: {names}', { names: theme.characters.map((c) => characterName(c, currentLanguage())).join(', ') })}</div>
                  )}
                  {theme.hasCss && <span className="theme-badge">{t('커스텀 CSS')}</span>}
                  {theme.hasCss && theme.id === current && onCssOn && (
                    <label className="toggle small">
                      <input type="checkbox" checked={cssOn} onChange={(e) => onCssOn(e.target.checked)} />
                      {t('이 사무실에서 커스텀 CSS 쓰기')}
                    </label>
                  )}
                </div>
                <div className="row theme-actions">
                  {theme.id === companyTheme && <span className="theme-badge">{t('공통 테마')}</span>}
                  {theme.id === ownTheme && <span className="theme-badge">{tpl('{name}만', { name: officeName })}</span>}
                  {theme.id === siteTheme && <span className="theme-badge">{t('사이트 테마')}</span>}
                  {onUseCompany && theme.id !== companyTheme && (
                    <button className="pixel-btn small primary" onClick={() => onUseCompany(theme.id)}>
                      {t('모든 사무실에 쓰기')}
                    </button>
                  )}
                  {onUseOffice && theme.id !== current && (
                    <button className="pixel-btn small" onClick={() => onUseOffice(theme.id === companyTheme ? null : theme.id)}>
                      {t('이 사무실만 쓰기')}
                    </button>
                  )}
                  {onUseSite && theme.id !== siteTheme && (
                    <button className="pixel-btn small" onClick={() => onUseSite(theme.id)}>
                      {t('사이트에 쓰기')}
                    </button>
                  )}
                  {!builtIn && (
                    <a className="pixel-btn small" href={themeApi.exportUrl(theme.id)} download>
                      {t('내보내기')}
                    </a>
                  )}
                  {!builtIn && isOwner && (
                    <button className="pixel-btn small" onClick={() => void remove(theme)}>
                      {t('지우기')}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {themes && (onBook || bookings.length > 0) && <Bookings themes={[PIXEL, ...themes]} bookings={bookings} onBook={onBook} />}
    </section>
  );
}

function siteThemeName(id: string, themes: ThemeSummary[] | null) {
  if (id === DEFAULT_THEME) return t(PIXEL.name);
  return themes?.find((theme) => theme.id === id)?.name ?? id;
}

const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Company themes booked for seasons: on those dates every office following the company theme shows the booked one. */
function Bookings({ themes, bookings, onBook }: { themes: ThemeSummary[]; bookings: ThemeBooking[]; onBook?: (bookings: ThemeBooking[]) => Promise<void> }) {
  const [rows, setRows] = useState(bookings);
  const [saving, setSaving] = useState(false);
  useEffect(() => setRows(bookings), [bookings]);
  const nameOf = (id: string) => {
    const theme = themes.find((x) => x.id === id);
    return theme ? (theme.id === DEFAULT_THEME ? t(theme.name) : theme.name) : id;
  };
  const active = bookings.find((b) => inDates([b.from, b.to], new Date()));
  const valid = rows.every((r) => MONTH_DAY.test(r.from) && MONTH_DAY.test(r.to));
  const dirty = JSON.stringify(rows) !== JSON.stringify(bookings);
  const set = (i: number, patch: Partial<ThemeBooking>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="theme-bookings">
      <h4>{t('기간별 테마')}</h4>
      <p className="muted small">
        {t('정한 기간에는 공통 테마 대신 다른 테마를 보여 줘요 (예: 10-24 ~ 10-31 할로윈). 따로 테마를 고른 사무실은 그대로예요. 테마 안에 시즌 모습이 들어 있으면 공통 테마만으로도 그 날짜에 바뀌어요.')}
      </p>
      {active && <p className="small theme-own-note">{tpl('지금은 "{theme}" 기간이에요.', { theme: nameOf(active.theme) })}</p>}
      {rows.length === 0 && <p className="muted small">{t('예약한 기간이 없어요.')}</p>}
      {rows.map((row, i) =>
        onBook ? (
          <div key={i} className="row theme-booking">
            <select value={row.theme} onChange={(e) => set(i, { theme: e.target.value })}>
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {nameOf(theme.id)}
                </option>
              ))}
            </select>
            <input className={MONTH_DAY.test(row.from) ? '' : 'invalid'} value={row.from} placeholder="10-24" maxLength={5} onChange={(e) => set(i, { from: e.target.value })} />
            <span>~</span>
            <input className={MONTH_DAY.test(row.to) ? '' : 'invalid'} value={row.to} placeholder="10-31" maxLength={5} onChange={(e) => set(i, { to: e.target.value })} />
            <button className="pixel-btn small" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              {t('빼기')}
            </button>
          </div>
        ) : (
          <div key={i} className="small">
            {nameOf(row.theme)} · {row.from} ~ {row.to}
          </div>
        ),
      )}
      {onBook && (
        <div className="row theme-booking-actions">
          <button
            className="pixel-btn small"
            disabled={rows.length >= THEME_BOOKINGS_MAX}
            onClick={() => setRows([...rows, { theme: themes.find((x) => x.id !== DEFAULT_THEME)?.id ?? DEFAULT_THEME, from: '10-24', to: '10-31' }])}
          >
            {t('기간 추가')}
          </button>
          <button
            className="pixel-btn small primary"
            disabled={!dirty || !valid || saving}
            onClick={() => {
              setSaving(true);
              void onBook(rows)
                .catch(() => {})
                .finally(() => setSaving(false));
            }}
          >
            {saving ? t('저장 중…') : t('저장')}
          </button>
        </div>
      )}
    </div>
  );
}
