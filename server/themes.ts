import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { zipSync } from 'fflate';
import {
  DEFAULT_THEME,
  isSafePath,
  parseThemeManifest,
  splitPackSkin,
  themeSummary,
  type ThemeManifest,
  type ThemeSummary,
} from '../shared/theme-pack.ts';
import { isSkin, type AgentSkin } from '../shared/skins.ts';
import { config } from './config.ts';
import { CONTENT_TYPES, extOf, readThemePackage } from './theme-package.ts';

export { CONTENT_TYPES, imageSize, readThemePackage } from './theme-package.ts';

/**
 * Installed theme packages, one folder per theme id under DATA_DIR/themes.
 * Only files the manifest uses are kept, after every check passes; a failed import leaves nothing behind.
 */

const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
const root = () => join(config.dataDir, 'themes');

/** Installs a package, replacing an installed theme with the same id. */
export function importTheme(zip: Uint8Array): ThemeSummary {
  const { manifest, files } = readThemePackage(zip);
  mkdirSync(root(), { recursive: true });
  const staging = join(root(), `.staging-${randomUUID()}`);
  try {
    for (const [path, bytes] of files) {
      mkdirSync(dirname(join(staging, path)), { recursive: true });
      writeFileSync(join(staging, path), bytes);
    }
    const target = join(root(), manifest.id);
    rmSync(target, { recursive: true, force: true });
    renameSync(staging, target);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return themeSummary(manifest);
}

const folderOf = (id: string) => (SLUG.test(id) && id !== DEFAULT_THEME ? join(root(), id) : null);

export function themeManifest(id: string): ThemeManifest | null {
  const folder = folderOf(id);
  if (!folder || !existsSync(join(folder, 'theme.json'))) return null;
  return parseThemeManifest(JSON.parse(readFileSync(join(folder, 'theme.json'), 'utf8')));
}

/** Whether an office may use this theme: the built-in one or an installed package. */
export const isUsableTheme = (id: unknown): id is string => typeof id === 'string' && (id === DEFAULT_THEME || themeManifest(id) !== null);

/** A built-in skin, or a character that exists in an installed theme. */
export function isUsableSkin(skin: unknown): skin is AgentSkin {
  if (isSkin(skin)) return true;
  const pack = typeof skin === 'string' ? splitPackSkin(skin) : null;
  return Boolean(pack && themeManifest(pack.themeId)?.characters.some((c) => c.id === pack.characterId));
}

/** An outfit the theme character behind `skin` has. */
export function isUsableOutfit(skin: string, outfit: unknown): outfit is string {
  const pack = splitPackSkin(skin);
  if (!pack || typeof outfit !== 'string') return false;
  return Boolean(themeManifest(pack.themeId)?.characters.find((c) => c.id === pack.characterId)?.outfits.some((o) => o.id === outfit));
}

export function listThemes(): ThemeSummary[] {
  if (!existsSync(root())) return [];
  return readdirSync(root(), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .flatMap((d) => {
      try {
        const manifest = themeManifest(d.name);
        return manifest ? [themeSummary(manifest)] : [];
      } catch (error) {
        console.warn(`theme ${d.name} is unreadable`, error);
        return [];
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function removeTheme(id: string) {
  const folder = folderOf(id);
  if (!folder || !existsSync(folder)) throw new Error('설치되지 않은 테마예요.');
  rmSync(folder, { recursive: true, force: true });
}

/** A file to serve under /themes/<id>/<path>, or null; only paths inside an installed theme resolve. */
export function themeFile(id: string, path: string): { file: string; contentType: string } | null {
  const folder = folderOf(id);
  if (!folder || !isSafePath(path)) return null;
  // DATA_DIR may be relative, and res.sendFile only takes absolute paths.
  const file = resolve(folder, path);
  return existsSync(file) ? { file, contentType: CONTENT_TYPES[extOf(path)] } : null;
}

/** The installed package as a zip, for sharing it again. */
export function exportTheme(id: string): Uint8Array {
  const manifest = themeManifest(id);
  if (!manifest) throw new Error('설치되지 않은 테마예요.');
  const folder = folderOf(id)!;
  const files: Record<string, Uint8Array> = {};
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`);
      else files[`${prefix}${entry.name}`] = readFileSync(join(dir, entry.name));
    }
  };
  walk(folder, '');
  return zipSync(files);
}
