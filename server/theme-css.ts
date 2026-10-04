import * as csstree from 'css-tree';
import { isSafePath, THEME_LIMITS } from '../shared/theme-pack.ts';

/**
 * Makes a theme's custom CSS safe to load into the app. Anyone can publish a theme, so the CSS is untrusted:
 * - every selector is scoped under the office that uses the theme;
 * - nothing loads from outside the package (no @import, no remote url());
 * - it cannot cover or restyle approval, sharing, billing or key screens, and cannot float over the page.
 */

const ALLOWED_AT_RULES = new Set(['media', 'supports', 'keyframes', '-webkit-keyframes', 'container']);
const DROPPED_PROPERTIES = new Set(['behavior', '-moz-binding']);
/** Screens a theme must not restyle: things people approve, share or pay with. */
const PROTECTED = /\.(approval|share|modal|billing|key|login)[\w-]*/i;
const MAX_Z_INDEX = 100;

export const themeScope = (themeId: string) => `[data-theme-pack="${themeId}"]`;

/** Resolves `url` against the folder of the CSS file, as browsers do; null when it leaves the package. */
export function resolveCssUrl(cssPath: string, url: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:|^\/|^\\|[?#]/i.test(url)) return null;
  const parts = cssPath.split('/').slice(0, -1);
  for (const part of url.split('/')) {
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else if (part !== '.' && part !== '') parts.push(part);
  }
  const path = parts.join('/');
  return isSafePath(path) ? path : null;
}

function scopeSelector(selector: string, scope: string) {
  const s = selector.trim();
  const nested = `${scope} ${s}`;
  // Already scoped (a theme exported from this app and imported again), or aimed at the root itself.
  const root = s.startsWith(scope) ? scope + s.slice(scope.length) : s.replace(/^(:root|html|body)\b/i, scope);
  if (!root.startsWith(scope)) return nested;
  // Only the scope element itself, its children or descendants: `~` and `+` would reach elements beside it.
  const rest = root.slice(scope.length);
  const inside = rest === '' || /^\s*>/.test(rest) || /^\s+[^\s~+]/.test(rest);
  return inside ? root : nested;
}

/**
 * Returns the cleaned CSS. `cssPath` is where the file sits in the package and `files` the package file list,
 * used to keep url() inside the package. Throws only when the CSS is too large.
 */
export function sanitizeThemeCss(css: string, themeId: string, cssPath: string, files: ReadonlySet<string>): string {
  if (Buffer.byteLength(css) > THEME_LIMITS.cssBytes) throw new Error(`테마 CSS는 ${THEME_LIMITS.cssBytes / 1024}KB까지예요.`);
  const scope = themeScope(themeId);
  const ast = csstree.parse(css, { parseValue: true, parseRulePrelude: true, parseAtrulePrelude: true });

  csstree.walk(ast, {
    visit: 'Atrule',
    enter(node, item, list) {
      if (!ALLOWED_AT_RULES.has(node.name.toLowerCase())) list?.remove(item);
    },
  });

  csstree.walk(ast, {
    visit: 'Rule',
    enter(node, item, list) {
      // Keyframe steps (from, 50%) are not selectors.
      if (this.atrule && /keyframes$/i.test(this.atrule.name)) return;
      if (node.prelude.type !== 'SelectorList') return list?.remove(item);
      const selectors = node.prelude.children
        .toArray()
        .map((s) => csstree.generate(s))
        .filter((s) => !PROTECTED.test(s))
        .map((s) => scopeSelector(s, scope));
      if (!selectors.length) return list?.remove(item);
      node.prelude = csstree.parse(selectors.join(', '), { context: 'selectorList' }) as csstree.SelectorList;
    },
  });

  csstree.walk(ast, {
    visit: 'Declaration',
    enter(node, item, list) {
      const property = node.property.toLowerCase();
      const value = csstree.generate(node.value);
      if (DROPPED_PROPERTIES.has(property) || /expression\s*\(|javascript:|vbscript:|image-set\s*\(/i.test(value)) return list?.remove(item);
      if (property === 'position' && /fixed/i.test(value)) return list?.remove(item);
      if (property === 'z-index') {
        const z = Number(value);
        if (!Number.isFinite(z)) return list?.remove(item);
        if (z > MAX_Z_INDEX) node.value = csstree.parse(String(MAX_Z_INDEX), { context: 'value' }) as csstree.Value;
        return;
      }
      let outside = false;
      csstree.walk(node.value, {
        visit: 'Url',
        enter(url) {
          // Left relative: the CSS is served from inside the theme folder, so it resolves there.
          const path = resolveCssUrl(cssPath, url.value);
          if (!path || !files.has(path)) outside = true;
        },
      });
      if (outside) list?.remove(item);
    },
  });

  return csstree.generate(ast);
}
