import { useEffect, useState, type CSSProperties } from 'react';
import { DEFAULT_THEME, parseThemeManifest, type ThemeManifest } from '../../shared/theme-pack.ts';
import { themeApi } from './themeApi.ts';

/**
 * Applies an installed theme's look to the part of the page it wraps: spread `attrs` on that element.
 * Color tokens become CSS variables on it; the theme's custom CSS (already scoped and cleaned by the server)
 * is linked while the theme is in use and only matches inside that element.
 */
export function useThemePack(themeId: string | undefined, allowCss = true) {
  const [manifest, setManifest] = useState<ThemeManifest | null>(null);
  const id = themeId && themeId !== DEFAULT_THEME ? themeId : null;

  useEffect(() => {
    setManifest(null);
    if (!id) return;
    let live = true;
    fetch(themeApi.previewUrl(id, 'theme.json'))
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((json) => live && setManifest(parseThemeManifest(json)))
      .catch((error) => console.warn(`theme ${id} manifest failed to load`, error));
    return () => {
      live = false;
    };
  }, [id]);

  const css = allowCss && manifest?.id === id ? manifest.css : null;
  useEffect(() => {
    if (!id || !css) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = themeApi.previewUrl(id, css);
    link.dataset.themePack = id;
    document.head.appendChild(link);
    return () => link.remove();
  }, [id, css]);

  if (!id || !manifest) return { attrs: {}, manifest: null };
  const style = Object.fromEntries(Object.entries(manifest.tokens).map(([name, value]) => [`--${name}`, value])) as CSSProperties;
  return { attrs: { 'data-theme-pack': id, style }, manifest };
}
