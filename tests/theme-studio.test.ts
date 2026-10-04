import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-studio-'));

const { assetPath, buildPackage, checkDraft, emptyDraft, gridFrames, previewManifest } = await import('../web/src/studio/buildPackage.ts');
const { readThemePackage } = await import('../server/themes.ts');

/** Just enough of a PNG for the header checks. */
function png(w: number, h: number) {
  const bytes = new Uint8Array(33);
  const view = new DataView(bytes.buffer);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  view.setUint32(8, 13);
  bytes.set(new TextEncoder().encode('IHDR'), 12);
  view.setUint32(16, w);
  view.setUint32(20, h);
  return bytes;
}

const image = (path: string, w: number, h: number) => ({ path, bytes: png(w, h), w, h });

function draft() {
  return {
    ...emptyDraft(),
    id: 'cozy',
    name: '아늑한 사무실',
    layers: [{ image: image('assets/room.png', 1000, 480), x: 0, y: 0, front: false }],
    characters: [
      {
        id: 'mina',
        name: '미나',
        sheet: image('assets/mina.png', 192, 96),
        frameW: 64,
        frameH: 96,
        scale: 1,
        anchor: { x: 0.5, y: 1 },
        head: { x: 0.5, y: 0.05 },
        states: { idle: { frames: ['f0'], fps: 6, loop: true }, walk: { frames: ['f1', 'f2'], fps: 8, loop: true } },
      },
    ],
    seats: { writer: { x: 420, y: 400 } },
    spots: { board: { x: 300, y: 20, w: 300, h: 90 } },
    tokens: { accent: '#6a5acd' },
    css: 'body .pixel-box { border-radius: 8px }',
  };
}

test('a sheet is cut into a grid of named frames', () => {
  const frames = gridFrames(draft().characters[0]);
  assert.deepEqual(Object.keys(frames), ['f0', 'f1', 'f2']);
  assert.deepEqual(frames.f2, { x: 128, y: 0, w: 64, h: 96 });
});

test('what the studio exports, the server installs as is', () => {
  assert.equal(checkDraft(draft()).error, null);
  const { manifest, files } = readThemePackage(buildPackage(draft(), png(500, 240)));
  assert.equal(manifest.id, 'cozy');
  assert.deepEqual(manifest.scene.seats, { writer: { x: 420, y: 400 } });
  assert.deepEqual(manifest.characters[0].states.walk?.frames, ['f1', 'f2']);
  assert.equal(manifest.characters[0].head.y, 0.05);
  assert.equal(manifest.css, 'theme.css');
  assert.match(new TextDecoder().decode(files.get('theme.css')), /\[data-theme-pack="cozy"\] \.pixel-box/);
});

test('problems are reported in the words the server would use', () => {
  const missingId = { ...draft(), id: '' };
  assert.match(checkDraft(missingId).error ?? '', /id는/);
  const noIdle = draft();
  noIdle.characters[0].states = { walk: noIdle.characters[0].states.walk } as never;
  assert.match(checkDraft(noIdle).error ?? '', /idle/);
  const badFrame = draft();
  badFrame.characters[0].frameW = 100; // one column now, so f1 and f2 are gone
  assert.match(checkDraft(badFrame).error ?? '', /없는 프레임 f1/);
  assert.throws(() => buildPackage(missingId, png(1, 1)), /id는/);
});

test('the preview draws an unfinished draft', () => {
  const unfinished = { ...draft(), id: '', name: '', license: '' };
  assert.ok(previewManifest(unfinished));
  assert.equal(previewManifest({ ...draft(), layers: [] }), null);
  const noIdle = draft();
  noIdle.characters[0].states = {};
  assert.equal(previewManifest(noIdle), null, 'characters without an idle frame are left out');
});

test('uploaded file names become unique package paths', () => {
  assert.equal(assetPath('My Room (1).PNG', []), 'assets/my-room-1.png');
  assert.equal(assetPath('방.jpg', []), 'assets/image.png');
  assert.equal(assetPath('room.png', ['assets/room.png', 'assets/room-2.png']), 'assets/room-3.png');
  assert.equal(assetPath('girl.webp', [], 'webp'), 'assets/girl.webp');
});
