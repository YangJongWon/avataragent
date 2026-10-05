import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { unzipSync, zipSync } from 'fflate';
import {
  DEFAULT_THEME,
  isSafePath,
  manifestFiles,
  parseThemeManifest,
  splitPackSkin,
  themeSummary,
  THEME_LIMITS,
  type ThemeManifest,
  type ThemeSummary,
} from '../shared/theme-pack.ts';
import { isSkin, type AgentSkin } from '../shared/skins.ts';
import { config } from './config.ts';
import { sanitizeThemeCss } from './theme-css.ts';

/**
 * Installed theme packages, one folder per theme id under DATA_DIR/themes.
 * Only files the manifest uses are kept, after every check passes; a failed import leaves nothing behind.
 */

const MAX_UNZIPPED = 64 * 1024 * 1024;
const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;

const root = () => join(config.dataDir, 'themes');
const fail = (message: string): never => {
  throw new Error(`테마 파일 오류: ${message}`);
};

export const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  webp: 'image/webp',
  json: 'application/json; charset=utf-8',
  css: 'text/css; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  woff2: 'font/woff2',
};
const extOf = (path: string) => path.split('.').pop()!.toLowerCase();

/** Pixel size from the file header, or null when the bytes are not the image their name claims. */
export function imageSize(bytes: Uint8Array, ext: string): { w: number; h: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (at: number, n: number) => String.fromCharCode(...bytes.subarray(at, at + n));
  if (ext === 'png') {
    if (bytes.length < 24 || view.getUint32(0) !== 0x89504e47 || ascii(12, 4) !== 'IHDR') return null;
    return { w: view.getUint32(16), h: view.getUint32(20) };
  }
  if (ext === 'webp') {
    if (bytes.length < 30 || ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP') return null;
    const chunk = ascii(12, 4);
    const u24 = (at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
    if (chunk === 'VP8X') return { w: 1 + u24(24), h: 1 + u24(27) };
    if (chunk === 'VP8L') {
      const bits = view.getUint32(21, true);
      return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) };
    }
    if (chunk === 'VP8 ') return { w: view.getUint16(26, true) & 0x3fff, h: view.getUint16(28, true) & 0x3fff };
  }
  return null;
}

/** Folders and OS clutter (__MACOSX, .DS_Store); `..` is not clutter and fails the path check instead. */
const ignored = (name: string) =>
  name.endsWith('/') || name.startsWith('__MACOSX/') || name.split('/').some((part) => part.startsWith('.') && part !== '.' && part !== '..');

/** Unpacks and checks a package; accepts a zip of the files or of one folder holding them. */
export function readThemePackage(zip: Uint8Array): { manifest: ThemeManifest; files: Map<string, Uint8Array> } {
  if (zip.byteLength > THEME_LIMITS.zipBytes) fail(`패키지는 ${THEME_LIMITS.zipBytes / 1024 / 1024}MB까지예요.`);
  const names: string[] = [];
  try {
    unzipSync(zip, { filter: (file) => (names.push(file.name), false) });
  } catch {
    fail('zip 파일을 열 수 없어요.');
  }
  const kept = names.filter((n) => !ignored(n));
  const prefix = kept.includes('theme.json') ? '' : (kept.find((n) => /^[^/]+\/theme\.json$/.test(n))?.replace('theme.json', '') ?? fail('theme.json이 없어요.'));

  let count = 0;
  let total = 0;
  const raw = unzipSync(zip, {
    filter(file) {
      if (ignored(file.name) || !file.name.startsWith(prefix)) return false;
      const path = file.name.slice(prefix.length);
      if (!isSafePath(path)) fail(`허용되지 않는 파일이에요: ${path}`);
      count += 1;
      total += file.originalSize;
      if (count > THEME_LIMITS.files) fail(`파일은 ${THEME_LIMITS.files}개까지예요.`);
      if (total > MAX_UNZIPPED) fail('압축을 푼 크기가 너무 커요.');
      return true;
    },
  });
  const all = new Map(Object.entries(raw).map(([name, bytes]) => [name.slice(prefix.length), bytes]));

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all.get('theme.json')));
  } catch {
    fail('theme.json을 읽을 수 없어요.');
  }
  const manifest = parseThemeManifest(json, new Set(all.keys()));

  const used = new Set([...manifestFiles(manifest), ...[...all.keys()].filter((p) => /^(LICENSE|CREDITS)(\.txt)?$/i.test(p))]);
  const files = new Map<string, Uint8Array>();
  for (const path of used) {
    const bytes = all.get(path)!;
    const ext = extOf(path);
    if (ext === 'png' || ext === 'webp') {
      const size = imageSize(bytes, ext);
      if (!size) fail(`${path}은(는) 올바른 ${ext.toUpperCase()} 이미지가 아니에요.`);
      if (size!.w > THEME_LIMITS.imagePx || size!.h > THEME_LIMITS.imagePx) fail(`${path}이(가) ${THEME_LIMITS.imagePx}px보다 커요.`);
    } else if (ext === 'woff2') {
      // Browsers check font files themselves before using them; here only that it is one, and not huge.
      if (bytes.length < 48 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'wOF2') fail(`${path}은(는) 올바른 WOFF2 글꼴이 아니에요.`);
      if (bytes.length > 4 * 1024 * 1024) fail(`${path}은(는) 4MB까지예요.`);
    } else {
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        fail(`${path}은(는) UTF-8 텍스트가 아니에요.`);
      }
    }
    files.set(path, bytes);
  }
  for (const c of manifest.characters) {
    const sheet = imageSize(files.get(c.sheet)!, extOf(c.sheet))!;
    const outside = Object.entries(c.frames).find(([, f]) => f.x + f.w > sheet.w || f.y + f.h > sheet.h);
    if (outside) fail(`${c.id}의 프레임 ${outside[0]}이(가) 스프라이트 시트 밖으로 나가요.`);
  }
  if (manifest.css) {
    let css = '';
    try {
      css = sanitizeThemeCss(new TextDecoder().decode(files.get(manifest.css)), manifest.id, manifest.css, new Set(files.keys()));
    } catch (error) {
      fail(`CSS를 읽을 수 없어요 (${error instanceof Error ? error.message : String(error)}).`);
    }
    files.set(manifest.css, new TextEncoder().encode(css));
  }
  files.set('theme.json', new TextEncoder().encode(JSON.stringify(manifest, null, 2)));
  return { manifest, files };
}

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
