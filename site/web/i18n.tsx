import { Fragment, type ReactNode } from 'react';
import { DEFAULT_LANGUAGE, detectLanguage, isLanguage, LANGUAGES, localeOf, translate, type Language, type Vars } from '../../shared/i18n.ts';
import { SITE_CATALOGUE, SITE_TEMPLATES } from './i18n-catalogue.ts';

/**
 * Display language for the public site. Like the app, Korean source text is the key and
 * anything untranslated falls back to it. The site catalogue is looked up first, then the
 * app's shared one (team names, roles, personalities), so the two never drift apart.
 *
 * The language lives in a module variable rather than context: `App` keeps it in state too,
 * and since no page is memoized, changing it re-renders every page with the new text.
 */

/** A language the visitor picked; it always wins. */
const CHOICE_KEY = 'siteLanguageChoice';
/** The language the access country gave last time, so the next visit paints in it right away. */
const COUNTRY_KEY = 'siteLanguageByCountry';
const PLACEHOLDER = /\{(\w+)\}/g;

/** Countries that open in a language other than English. */
const COUNTRY_LANGUAGE: Record<string, Language> = { KR: 'ko', JP: 'ja', CN: 'zh', TW: 'zh', HK: 'zh', MO: 'zh', SG: 'zh' };

function stored(key: string): Language | null {
  try {
    const value = localStorage.getItem(key);
    return isLanguage(value) ? value : null;
  } catch {
    return null; // 저장소를 막은 브라우저
  }
}

function store(key: string, language: Language) {
  try {
    localStorage.setItem(key, language);
  } catch {
    // 개인 모드처럼 저장을 막으면 이번 방문에만 적용한다.
  }
}

/** Order: the visitor's own pick, then the access country (as last seen), then the browser language. */
function seed(): Language {
  return stored(CHOICE_KEY) ?? stored(COUNTRY_KEY) ?? detectLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

let active: Language = typeof navigator === 'undefined' ? DEFAULT_LANGUAGE : seed();

export { isLanguage, LANGUAGES, type Language };
export const currentLanguage = () => active;
export const locale = () => localeOf(active);

const TITLE: Record<Language, string> = {
  ko: 'AvatarCast — 일하는 모습이 보이는 AI 직원들',
  zh: 'AvatarCast — 看得见工作过程的 AI 员工',
  ja: 'AvatarCast — 働く姿が見える AI 社員たち',
  en: 'AvatarCast — AI staff you can watch at work',
};

/** Applies a language to the page chrome. */
export function setLanguage(language: Language) {
  active = language;
  document.documentElement.lang = language;
  document.title = TITLE[language];
}

/** The visitor picked a language: use it from now on, whatever the country. */
export function chooseLanguage(language: Language) {
  store(CHOICE_KEY, language);
  setLanguage(language);
}

/**
 * The server told us the access country. Unless the visitor picked a language, the country decides:
 * its own language for KR/JP/CN/TW/HK/MO/SG, English elsewhere. Unknown country keeps the current one.
 */
export function languageForCountry(country: string | null | undefined): Language {
  if (stored(CHOICE_KEY) || !country) return active;
  const language = COUNTRY_LANGUAGE[country] ?? 'en';
  store(COUNTRY_KEY, language);
  return language;
}

/** Translates Korean source text, falling back to the source. */
export function t(source: string): string {
  if (active === 'ko') return source;
  return SITE_CATALOGUE[source]?.[active] ?? translate(source, active);
}

/** Translates a sentence with `{holes}` and fills them. */
export function tpl(source: string, vars: Vars): string {
  const template = (active === 'ko' ? undefined : SITE_TEMPLATES[source]?.[active]) ?? source;
  return template.replace(PLACEHOLDER, (hole, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? hole : String(value);
  });
}

/** Like `tpl`, but holes take React nodes (links, bold text), since word order differs by language. */
export function rich(source: string, nodes: Record<string, ReactNode>): ReactNode {
  const template = (active === 'ko' ? undefined : SITE_TEMPLATES[source]?.[active]) ?? source;
  return template.split(PLACEHOLDER).map((part, i) => <Fragment key={i}>{i % 2 ? (nodes[part] ?? `{${part}}`) : part}</Fragment>);
}

export const day = (iso: string) => new Date(iso).toLocaleDateString(locale());
export const num = (n: number) => n.toLocaleString(locale());
