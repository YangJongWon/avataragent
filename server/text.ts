import { translate, viewerText, type Language } from '../shared/i18n.ts';
import { SERVER_TEXT as TEXT } from '../shared/server-text.ts';
import { store } from './store.ts';

/**
 * Text the server writes itself, in the office's display language: what staff say while they work,
 * approval headlines, and everything simulation mode makes up in place of a real AI. Real AI output
 * already follows the language through the system prompt; without this, simulation stayed Korean.
 * Like the UI, the Korean source is the key, and the app's shared catalogue is the fallback.
 * Text is written once in the language active at that moment; switching later doesn't rewrite it.
 */

const PLACEHOLDER = /\{(\w+)\}/g;

export const lang = (): Language => store.data.language;

export function L(source: string): string {
  const language = lang();
  if (language === 'ko') return source;
  return TEXT[source]?.[language] ?? translate(source, language);
}

export function LT(source: string, vars: Record<string, string | number>): string {
  const language = lang();
  const template = (language === 'ko' ? undefined : TEXT[source]?.[language]) ?? source;
  return template.replace(PLACEHOLDER, (hole, key: string) => (key in vars ? String(vars[key]) : hole));
}

/**
 * A fixed sentence for the screen (a staff line, an approval headline): kept as its Korean source and values, so each
 * viewer reads it in their own screen language rather than the language AI output is written in.
 * Values are passed as they are; ones that are themselves fixed sentences (step names) are translated on screen too.
 */
export const V = (source: string, vars: Record<string, string | number> = {}) => viewerText(source, vars);
