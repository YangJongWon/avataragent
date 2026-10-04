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
 * CSS `:lang()` selectors follow the choice. The persisted server value wins once a
 * snapshot arrives; localStorage only covers the first paint before that.
 */
export function LanguageProvider({ language, children }: { language?: Language; children: ReactNode }) {
  const [current, setCurrent] = useState<Language>(language ?? seedLanguage);

  useEffect(() => {
    if (!language) return;
    setCurrent(language);
    localStorage.setItem(STORAGE_KEY, language);
  }, [language]);

  // Plain helpers such as `eventLabel()` read this module-level value because they sit
  // outside React. Assigning during render is safe: it is idempotent for a given value.
  setActiveLanguage(current);

  useEffect(() => {
    document.documentElement.lang = languageOf(current).locale.split('-')[0];
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