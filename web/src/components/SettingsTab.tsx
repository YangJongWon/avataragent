import { useState } from 'react';
import { LANGUAGES, languageOf, type Language } from '../../../shared/i18n.ts';
import type { Snapshot } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { useLanguage } from '../LanguageProvider.tsx';

export function SettingsTab({
  snapshot,
  onError,
  onNotice,
}: { snapshot: Snapshot; onError: (m: string) => void; onNotice: (m: string) => void }) {
  const { t, language, setLanguage } = useLanguage();
  const [busy, setBusy] = useState<Language | null>(null);
  const current = languageOf(snapshot.language ?? language);

  const choose = async (target: Language) => {
    if (target === language) return;
    setLanguage(target);
    setBusy(target);
    try {
      await api.setLanguage(target);
      onNotice(`${languageOf(target).label}로 바꿨어요.`);
    } catch (e) {
      setLanguage(language);
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page">
      <h2>{t('환경 설정')}</h2>

      <section className="pixel-box section">
        <h3>{t('화면 언어')}</h3>
        <div className="lang-grid">
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`lang-option ${l.id === current.id ? 'selected' : ''}`}
              disabled={busy !== null}
              aria-pressed={l.id === current.id}
              onClick={() => void choose(l.id)}
            >
              <span className="lang-flag">{l.flag}</span>
              <b>{l.label}</b>
              <span className="small muted">{l.note}</span>
              {l.id === current.id && <span className="lang-check">✓ {t('현재 언어')}</span>}
            </button>
          ))}
        </div>
        <p className="muted small">{t('언어를 고르면 설정 화면과 안내 문구가 바뀝니다.')}</p>
        <p className="muted small">선택한 언어는 서버에 저장돼서 새로 고쳐도 그대로예요. 여러 사람이 함께 쓰는 회사에서는 모두에게 같은 언어로 보여요.</p>
      </section>
    </div>
  );
}