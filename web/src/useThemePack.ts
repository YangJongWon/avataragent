import { useEffect, useState, type CSSProperties } from 'react';
import { activeVariant, applyVariant, DEFAULT_THEME, parseThemeManifest, type SiteFont, type ThemeManifest } from '../../shared/theme-pack.ts';
import { themeApi } from './themeApi.ts';

const manifests = new Map<string, Promise<ThemeManifest>>();

/** An installed theme's manifest, fetched once per page; null for the built-in theme or while loading. */
export function useThemeManifest(themeId: string | undefined) {
  const [manifest, setManifest] = useState<ThemeManifest | null>(null);
  const id = themeId && themeId !== DEFAULT_THEME ? themeId : null;

  useEffect(() => {
    setManifest(null);
    if (!id) return;
    let live = true;
    let request = manifests.get(id);
    if (!request) {
      request = fetch(themeApi.previewUrl(id, 'theme.json'))
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then((json) => parseThemeManifest(json));
      // A failed or replaced theme is fetched again next time.
      request.catch(() => manifests.delete(id));
      manifests.set(id, request);
    }
    request.then((m) => live && setManifest(m)).catch((error) => console.warn(`theme ${id} manifest failed to load`, error));
    return () => {
      live = false;
    };
  }, [id]);

  return manifest?.id === id ? manifest : null;
}

/** Forgets cached manifests, after a theme is installed again or removed. */
export const forgetThemeManifests = () => manifests.clear();

const BASE_FONT = "'Malgun Gothic', 'Apple SD Gothic Neo', system-ui, sans-serif";
const FONTS: Record<SiteFont, string | null> = {
  default: null,
  rounded: `'Jua', 'NanumSquareRound', 'Arial Rounded MT Bold', ${BASE_FONT}`,
  serif: "'Nanum Myeongjo', 'Noto Serif KR', 'Batang', Georgia, serif",
  mono: `'D2Coding', 'Consolas', ${BASE_FONT}`,
};

/**
 * Applies an installed theme's look to the part of the page it wraps: spread `attrs` on that element.
 * Color tokens, corner rounding, font and page background become CSS variables on it (with the seasonal
 * variant of today folded in); the theme's custom CSS (already scoped and cleaned by the server)
 * is linked while the theme is in use and only matches inside that element.
 */
export function useThemePack(themeId: string | undefined, allowCss = true) {
  const manifest = useThemeManifest(themeId);
  const id = manifest?.id ?? null;
  const css = allowCss ? (manifest?.css ?? null) : null;
  const look = manifest && applyVariant(manifest, activeVariant(manifest, new Date()));
  const fontFile = look && typeof look.site.font === 'object' ? look.site.font.file : null;

  useEffect(() => {
    if (!id || !css) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = themeApi.previewUrl(id, css);
    link.dataset.themePack = id;
    document.head.appendChild(link);
    return () => link.remove();
  }, [id, css]);

  useEffect(() => {
    if (!id || !fontFile) return;
    const style = document.createElement('style');
    style.dataset.themePack = id;
    style.textContent = `@font-face{font-family:${JSON.stringify(`theme-${id}`)};src:url(${JSON.stringify(themeApi.previewUrl(id, fontFile))}) format('woff2');font-display:swap}`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [id, fontFile]);

  if (!manifest || !look) return { attrs: {}, manifest: null };
  const vars: Record<string, string> = Object.fromEntries(Object.entries(look.tokens).map(([name, value]) => [`--${name}`, value]));
  const { font, radius, background } = look.site;
  if (fontFile) vars['--font'] = `${JSON.stringify(`theme-${manifest.id}`)}, ${BASE_FONT}`;
  else if (typeof font === 'string' && FONTS[font]) vars['--font'] = FONTS[font]!;
  if (radius !== undefined) vars['--radius'] = `${radius}px`;
  if (background) {
    vars['--page-bg'] = `url(${JSON.stringify(themeApi.previewUrl(manifest.id, background.image))})`;
    vars['--page-repeat'] = background.repeat ? 'repeat' : 'no-repeat';
    vars['--page-size'] = background.repeat ? 'auto' : 'cover';
  }
  return { attrs: { 'data-theme-pack': manifest.id, style: vars as CSSProperties }, manifest };
}
