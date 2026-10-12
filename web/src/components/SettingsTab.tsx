import { useState } from 'react';
import { LANGUAGES, languageOf, type Language } from '../../../shared/i18n.ts';
import type { Snapshot } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { CURRENCIES, currencyFor, type CurrencyChoice } from '../currency.ts';
import { useLanguage } from '../LanguageProvider.tsx';

interface Props {
  snapshot: Snapshot;
  currency: CurrencyChoice;
  onCurrency: (choice: CurrencyChoice) => void;
  onError: (m: string) => void;
  onNotice: (m: string) => void;
}

/**
 * Display language and currency are personal: they live in this browser and differ from person to person.
 * The language AI results are written in is a company setting on the server, kept apart from them.
 */
export function SettingsTab({ snapshot, currency, onCurrency, onError, onNotice }: Props) {
  const { t, tpl, language, setLanguage } = useLanguage();
  const [busy, setBusy] = useState<Language | null>(null);
  const isOwner = snapshot.viewer.kind === 'owner';
  const output = languageOf(snapshot.language ?? language);

  const chooseOutput = async (target: Language) => {
    if (target === output.id) return;
    setBusy(target);
    try {
      await api.setLanguage(target);
      onNotice(tpl('AI 결과물을 {language}(으)로 쓰게 했어요.', { language: languageOf(target).label }));
    } catch (e) {
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
            <button key={l.id} type="button" className={`lang-option ${l.id === language ? 'selected' : ''}`} aria-pressed={l.id === language} onClick={() => setLanguage(l.id)}>
              <span className="lang-flag">{l.flag}</span>
              <b>{l.label}</b>
              <span className="small muted">{l.note}</span>
              {l.id === language && <span className="lang-check">✓ {t('현재 언어')}</span>}
            </button>
          ))}
        </div>
        <p className="muted small">{t('내 화면에만 적용되는 개인 설정이에요. 이 브라우저에 저장되고, 같은 회사의 다른 사람은 각자 고른 언어로 봐요.')}</p>
      </section>

      <section className="pixel-box section">
        <h3>{t('통화 표시')}</h3>
        <div className="lang-grid">
          <button type="button" className={`lang-option ${currency === 'auto' ? 'selected' : ''}`} aria-pressed={currency === 'auto'} onClick={() => onCurrency('auto')}>
            <b>{t('언어에 맞춰 자동')}</b>
            <span className="small muted">{tpl('지금은 {code}', { code: currencyFor('auto', language) })}</span>
            {currency === 'auto' && <span className="lang-check">✓</span>}
          </button>
          {CURRENCIES.map((c) => (
            <button key={c.id} type="button" className={`lang-option ${currency === c.id ? 'selected' : ''}`} aria-pressed={currency === c.id} onClick={() => onCurrency(c.id)}>
              <b>{c.label}</b>
              {currency === c.id && <span className="lang-check">✓</span>}
            </button>
          ))}
        </div>
        <p className="muted small">{t('금액은 원화로 계산하고, 화면에는 최신 환율로 바꿔서 보여 줘요. 환율을 못 받으면 원화로 보여요. 개인 설정이에요.')}</p>
      </section>

      <section className="pixel-box section">
        <h3>{t('AI 결과물 언어 (회사 공통)')}</h3>
        <div className="lang-grid">
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`lang-option ${l.id === output.id ? 'selected' : ''}`}
              disabled={!isOwner || busy !== null}
              aria-pressed={l.id === output.id}
              onClick={() => void chooseOutput(l.id)}
            >
              <span className="lang-flag">{l.flag}</span>
              <b>{l.label}</b>
              {l.id === output.id && <span className="lang-check">✓</span>}
            </button>
          ))}
        </div>
        <p className="muted small">{t('직원들이 보고서·메모·말풍선을 쓰는 언어예요. 회사 데이터라 모두에게 같고, 바꾼 뒤 새로 만드는 결과물부터 적용돼요.')}</p>
        {!isOwner && <p className="muted small">{t('주인만 바꿀 수 있어요.')}</p>}
      </section>
    </div>
  );
}
