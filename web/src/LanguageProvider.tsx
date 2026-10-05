import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_LANGUAGE,
  detectLanguage,
  isLanguage,
  languageOf,
  localeOf,
  setActiveLanguage,
  translate,
  translateTemplate,
  type Language,
  type Vars,
} from '../../shared/i18n.ts';

interface LanguageContextValue {
  language: Language;
  /** BCP 47 tag for Intl formatting. */
  locale: string;
  /** Translates Korean source text, falling back to the source when untranslated. */
  t: (source: string) => string;
  /** Translates a sentence and fills its `{placeholders}`. */
  tpl: (source: string, vars: Vars) => string;
  /** Overrides the browser/seed language; the settings page calls this. */
  setLanguage: (language: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = 'uiLanguage';

const FALLBACK: LanguageContextValue = {
  language: DEFAULT_LANGUAGE,
  locale: localeOf(DEFAULT_LANGUAGE),
  t: (source) => source,
  tpl: (source) => source,
  setLanguage: () => {},
};

function seedLanguage(): Language {
  if (typeof localStorage === 'undefined' || typeof navigator === 'undefined') return DEFAULT_LANGUAGE;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (isLanguage(saved)) return saved;
  return detectLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

/**
 * Holds the display language and keeps <html lang> in step so screen readers and
 * CSS `:lang()` selectors follow the choice. Mount this above every component that
 * calls `useLanguage()` -- including the app shell itself. The persisted server value
 * is pushed in through `setLanguage` once a snapshot arrives; localStorage only covers
 * the first paint before that.
 */
export function LanguageProvider({ language, children }: { language?: Language; children: ReactNode }) {
  const [current, setCurrent] = useState<Language>(language ?? seedLanguage);

  useEffect(() => {
    if (language) setCurrent(language);
  }, [language]);

  // Plain helpers such as `eventLabel()` read this module-level value because they sit
  // outside React. Assigning during render is safe: it is idempotent for a given value.
  setActiveLanguage(current);

  useEffect(() => {
    document.documentElement.lang = languageOf(current).locale.split('-')[0];
  }, [current]);

  // Persist whichever way the language arrived: the server snapshot pushed in by the
  // shell, or a direct choice on the settings page. Seeded by localStorage on first
  // paint, so it only has to keep the next reload's first paint in step.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, current);
    } catch {
      // 개인 모드처럼 저장을 막으면 첫 화면 시드만 포기한다.
    }
  }, [current]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language: current,
      locale: localeOf(current),
      t: (source) => translate(source, current),
      tpl: (source, vars) => translateTemplate(source, current, vars),
      setLanguage: setCurrent,
    }),
    [current],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** Falls back to identity translation so components still render outside the provider. */
export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext) ?? FALLBACK;
}