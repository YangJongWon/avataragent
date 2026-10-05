import { unzipSync } from 'fflate';
import { isSafePath, manifestFiles, parseThemeManifest, THEME_LIMITS, type ThemeManifest } from '../shared/theme-pack.ts';
import { sanitizeThemeCss } from './theme-css.ts';

/**
 * Reading and checking a theme package, with no app settings involved: the app installs with it
 * (server/themes.ts) and the project site checks community uploads with it.
 */

const MAX_UNZIPPED = 64 * 1024 * 1024;

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
export const extOf = (path: string) => path.split('.').pop()!.toLowerCase();

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
