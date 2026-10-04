/**
 * Display language. Korean stays the source of truth for the catalogue: every key
 * without a translation falls back to the Korean text, so adding a language never
 * blanks the UI.
 */
export type Language = 'ko' | 'zh' | 'ja' | 'en';

export interface LanguageMeta {
  id: Language;
  /** Self-describing name, always written in the language itself. */
  label: string;
  /** Endonym plus an English gloss, for people who cannot read the endonym. */
  note: string;
  flag: string;
  /** BCP 47 tag for Intl formatting and <html lang>. */
  locale: string;
}

export const LANGUAGES: LanguageMeta[] = [
  { id: 'ko', label: '한국어', note: 'Korean', flag: '🇰🇷', locale: 'ko-KR' },
  { id: 'zh', label: '中文', note: 'Chinese (Simplified)', flag: '🇨🇳', locale: 'zh-CN' },
  { id: 'ja', label: '日本語', note: 'Japanese', flag: '🇯🇵', locale: 'ja-JP' },
  { id: 'en', label: 'English', note: 'English', flag: '🇬🇧', locale: 'en-US' },
];

export const DEFAULT_LANGUAGE: Language = 'ko';

export const isLanguage = (v: unknown): v is Language => LANGUAGES.some((l) => l.id === v);
export const languageOf = (id: Language | undefined) => LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[0];
export const localeOf = (id: Language | undefined) => languageOf(id).locale;

/** Picks the closest supported language for a browser locale list, e.g. `['ja-JP','en']` -> 'ja'. */
export function detectLanguage(tags: readonly string[]): Language {
  for (const tag of tags) {
    const primary = tag.toLowerCase().split('-')[0];
    if (isLanguage(primary)) return primary;
  }
  return DEFAULT_LANGUAGE;
}

type Catalogue = Record<string, Partial<Record<Language, string>>>;

/**
 * Keys are the Korean source string. Keeping Korean as the key means an untranslated
 * screen still reads correctly instead of showing a raw key.
 */
const CATALOGUE: Catalogue = {
  // 환경 설정
  '환경 설정': { zh: '环境设置', ja: '環境設定', en: 'Settings' },
  '화면 언어': { zh: '界面语言', ja: '表示言語', en: 'Display language' },
  '언어를 고르면 설정 화면과 안내 문구가 바뀝니다.': {
    zh: '选择语言后，设置界面和说明文字会随之改变。',
    ja: '言語を選ぶと、設定画面と説明文が切り替わります。',
    en: 'Pick a language and the settings screen and help text switch with it.',
  },
  '저장': { zh: '保存', ja: '保存', en: 'Save' },
  '닫기': { zh: '关闭', ja: '閉じる', en: 'Close' },

  // 공통
  '예정': { zh: '预计', ja: '予定', en: 'ETA' },
  '현재 언어': { zh: '当前语言', ja: '現在の言語', en: 'Current language' },
};

/** Translates `ko` source text, falling back to the source itself when untranslated. */
export function translate(source: string, language: Language): string {
  const hit = CATALOGUE[source];
  return hit ? hit[language] ?? source : source;
}