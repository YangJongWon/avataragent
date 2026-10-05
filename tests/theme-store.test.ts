import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import test from 'node:test';
import { strToU8, unzipSync, zipSync } from 'fflate';

// Relative on purpose: the default DATA_DIR is './data'.
process.env.DATA_DIR = relative(process.cwd(), mkdtempSync(join(tmpdir(), 'avataragent-themes-')));

const { exportTheme, importTheme, imageSize, isUsableSkin, isUsableTheme, listThemes, removeTheme, themeFile, themeManifest } = await import('../server/themes.ts');
const { isAgentSkin, builtinSkin } = await import('../shared/skins.ts');

/** Just enough of a PNG for the header checks. */
function png(w: number, h: number) {
  const bytes = new Uint8Array(33);
  const view = new DataView(bytes.buffer);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  view.setUint32(8, 13);
  bytes.set(strToU8('IHDR'), 12);
  view.setUint32(16, w);
  view.setUint32(20, h);
  return bytes;
}

const manifest = (patch: Record<string, unknown> = {}) => ({
  format: 'avataragent-theme',
  version: 1,
  id: 'cozy',
  themeVersion: '1.0.0',
  name: '아늑한 사무실',
  license: 'CC0-1.0',
  preview: 'preview.png',
  scene: { layers: [{ image: 'assets/room.png', x: 0, y: 0 }] },
  characters: [{ id: 'mina', sheet: 'assets/mina.png', frames: { a: { x: 0, y: 0, w: 64, h: 96 } }, states: { idle: { frames: ['a'] } } }],
  css: 'theme.css',
  ...patch,
});

const pack = (files: Record<string, Uint8Array>) => zipSync(files);
const baseFiles = (patch: Record<string, unknown> = {}) => ({
  'theme.json': strToU8(JSON.stringify(manifest(patch))),
  'preview.png': png(4, 4),
  'assets/room.png': png(1000, 480),
  'assets/mina.png': png(128, 96),
  'theme.css': strToU8('.panel { background: url(assets/room.png) } .x { background: url(https://evil.example/a.png) }'),
});

test('a package installs, lists, serves, exports and removes', () => {
  const summary = importTheme(pack({ ...baseFiles(), 'assets/unused.png': png(2, 2), 'LICENSE.txt': strToU8('CC0') }));
  assert.deepEqual(summary.characters, [{ id: 'mina', name: 'mina' }]);
  assert.equal(summary.hasCss, true);
  assert.deepEqual(listThemes().map((t) => t.id), ['cozy']);

  assert.equal(themeFile('cozy', 'assets/unused.png'), null, 'files the theme does not use are dropped');
  assert.ok(themeFile('cozy', 'LICENSE.txt'));
  assert.ok(isAbsolute(themeFile('cozy', 'LICENSE.txt')!.file), 'res.sendFile needs an absolute path');
  assert.equal(themeFile('cozy', '../../office.db'), null);
  assert.equal(themeFile('pixel', 'theme.json'), null);

  const css = readFileSync(themeFile('cozy', 'theme.css')!.file, 'utf8');
  assert.match(css, /\[data-theme-pack="cozy"\] \.panel\{background:url\(assets\/room\.png\)\}/);
  assert.doesNotMatch(css, /evil/);

  const exported = exportTheme('cozy');
  assert.deepEqual(Object.keys(unzipSync(exported)).sort(), ['LICENSE.txt', 'assets/mina.png', 'assets/room.png', 'preview.png', 'theme.css', 'theme.json']);
  removeTheme('cozy');
  assert.deepEqual(listThemes(), []);

  importTheme(exported);
  assert.equal(themeManifest('cozy')?.name, '아늑한 사무실', 'an exported theme imports again unchanged');
  assert.equal(readFileSync(themeFile('cozy', 'theme.css')!.file, 'utf8'), css);
  removeTheme('cozy');
});

test('offices and agents can only use what is installed', () => {
  importTheme(pack(baseFiles()));
  assert.ok(isUsableTheme('pixel'));
  assert.ok(isUsableTheme('cozy'));
  assert.ok(!isUsableTheme('missing'));
  assert.ok(isUsableSkin('bishoujo'));
  assert.ok(isUsableSkin('cozy:mina'));
  assert.ok(!isUsableSkin('cozy:nobody'));
  assert.ok(!isUsableSkin('missing:mina'));
  removeTheme('cozy');
  assert.ok(!isUsableSkin('cozy:mina'));

  // Stored skins are checked by shape only, so a removed theme does not wipe choices on restart.
  assert.ok(isAgentSkin('cozy:mina'));
  assert.ok(!isAgentSkin('cozy:'));
  assert.ok(!isAgentSkin('../x:y'));
  assert.equal(builtinSkin('cozy:mina'), 'pixel');
  assert.equal(builtinSkin('pinkgirl'), 'pinkgirl');
});

test('a site font installs as WOFF2 and anything else under that name is refused', () => {
  const font = new Uint8Array(64);
  font.set(strToU8('wOF2'));
  const site = { site: { font: { file: 'fonts/hand.woff2' }, radius: 8 } };
  importTheme(pack({ ...baseFiles(site), 'fonts/hand.woff2': font }));
  assert.ok(themeFile('cozy', 'fonts/hand.woff2'));
  assert.equal(themeFile('cozy', 'fonts/hand.woff2')!.contentType, 'font/woff2');
  removeTheme('cozy');
  assert.throws(() => importTheme(pack({ ...baseFiles(site), 'fonts/hand.woff2': strToU8('<html>not a font</html>'.padEnd(64)) })), /WOFF2/);
  assert.deepEqual(listThemes(), []);
});

test('a zip of the theme folder works too', () => {
  const files = Object.fromEntries(Object.entries(baseFiles()).map(([k, v]) => [`my-theme/${k}`, v]));
  importTheme(pack({ ...files, '__MACOSX/my-theme/._theme.json': strToU8('x'), 'my-theme/.DS_Store': strToU8('x') }));
  assert.ok(themeManifest('cozy'));
  removeTheme('cozy');
});

test('broken or unsafe packages are refused and leave nothing behind', () => {
  const refuse = (files: Record<string, Uint8Array>, message: RegExp) => assert.throws(() => importTheme(pack(files)), message);
  refuse({ 'readme.txt': strToU8('hi') }, /theme\.json이 없어요/);
  refuse({ ...baseFiles(), '../evil.png': png(1, 1) }, /허용되지 않는 파일/);
  refuse({ ...baseFiles(), 'run.js': strToU8('alert(1)') }, /허용되지 않는 파일/);
  refuse({ ...baseFiles(), 'assets/room.png': strToU8('<html>not a png</html>') }, /올바른 PNG/);
  refuse({ ...baseFiles(), 'assets/room.png': png(5000, 10) }, /4096px/);
  refuse({ ...baseFiles(), 'assets/mina.png': png(32, 32) }, /시트 밖/);
  refuse(Object.fromEntries(Array.from({ length: 301 }, (_, i) => [`assets/x${i}.txt`, strToU8('x')]).concat(Object.entries(baseFiles()))), /300개까지/);
  assert.throws(() => importTheme(strToU8('not a zip')), /zip 파일을 열 수 없어요/);
  assert.deepEqual(listThemes(), []);
  assert.ok(!existsSync(join(process.env.DATA_DIR!, 'themes', 'cozy')));
});

test('image headers are read for PNG and WebP', () => {
  assert.deepEqual(imageSize(png(10, 20), 'png'), { w: 10, h: 20 });
  assert.equal(imageSize(png(10, 20), 'webp'), null);
  const webp = new Uint8Array(30);
  webp.set(strToU8('RIFF'), 0);
  webp.set(strToU8('WEBPVP8X'), 8);
  webp.set([99, 0, 0, 49, 0, 0], 24);
  assert.deepEqual(imageSize(webp, 'webp'), { w: 100, h: 50 });
});
