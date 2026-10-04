import assert from 'node:assert/strict';
import test from 'node:test';

const { STATE_FALLBACK, THEME_STATES, isSafePath, parseThemeManifest, resolveState, splitPackSkin } = await import('../shared/theme-pack.ts');
const { DEFAULT_LAYOUT, mergeLayout } = await import('../web/src/office/theme.ts');

const minimal = () => ({
  format: 'avataragent-theme',
  version: 1,
  id: 'cozy-office',
  themeVersion: '1.0.0',
  name: '아늑한 사무실',
  license: 'CC-BY-4.0',
  preview: 'preview.png',
  scene: { layers: [{ image: 'assets/room.png', x: 0, y: 0 }] },
  characters: [{ id: 'mina', sheet: 'assets/mina.png', frames: { a: { x: 0, y: 0, w: 64, h: 96 } }, states: { idle: { frames: ['a'] } } }],
});
const files = new Set(['theme.json', 'preview.png', 'assets/room.png', 'assets/mina.png']);

test('a theme with one background and a single idle frame is valid', () => {
  const theme = parseThemeManifest(minimal(), files);
  assert.equal(theme.characters[0].states.idle.fps, 6);
  assert.equal(theme.scene.scaleMode, 'linear');
  assert.equal(theme.css, null);
  assert.deepEqual(theme.scene.spots, {});
  assert.deepEqual(theme.scene.extraSeats, []);
  assert.deepEqual(parseThemeManifest(JSON.parse(JSON.stringify(theme)), files), theme);
});

test('every fallback chain ends at idle without cycles', () => {
  for (const state of THEME_STATES) {
    const seen = new Set<string>();
    let current: string | null = state;
    while (current) {
      assert.ok(!seen.has(current), `cycle at ${state}`);
      seen.add(current);
      current = STATE_FALLBACK[current as keyof typeof STATE_FALLBACK];
    }
    assert.ok(seen.has('idle'), `${state} never reaches idle`);
  }
});

test('missing states fall back to the closest defined one', () => {
  const clip = { frames: ['a'], fps: 6, loop: true };
  assert.equal(resolveState({ idle: clip }, 'task.approved'), 'idle');
  assert.equal(resolveState({ idle: clip, smile: clip }, 'task.approved'), 'smile');
  assert.equal(resolveState({ idle: clip, smile: clip, celebrate: clip }, 'task.approved'), 'celebrate');
  assert.equal(resolveState({ idle: clip, sit: clip }, 'step.research'), 'sit');
});

test('unknown fields and unknown states are dropped', () => {
  const input = { ...minimal(), script: 'alert(1)' } as Record<string, unknown>;
  (input.characters as any)[0].states.dance = { frames: ['a'] };
  const theme = parseThemeManifest(input, files) as unknown as Record<string, unknown>;
  assert.equal(theme.script, undefined);
  assert.equal((theme.characters as any)[0].states.dance, undefined);
});

test('rejects broken or unsafe packages', () => {
  const broken = (patch: (t: any) => void, message: RegExp) => {
    const t = minimal() as any;
    patch(t);
    assert.throws(() => parseThemeManifest(t, files), message);
  };
  broken((t) => (t.format = 'other'), /테마 패키지가 아니에요/);
  broken((t) => (t.id = 'pixel'), /앱에 들어 있는 테마 이름/);
  broken((t) => (t.id = 'Bad Id'), /id는/);
  broken((t) => delete t.license, /라이선스/);
  broken((t) => (t.characters[0].states = {}), /idle/);
  broken((t) => (t.characters[0].states.idle.frames = ['nope']), /없는 프레임/);
  broken((t) => (t.scene.layers[0].image = '../../etc/passwd.png'), /경로/);
  broken((t) => (t.scene.layers[0].image = 'assets/run.exe'), /경로/);
  broken((t) => (t.scene.layers[0].image = 'assets/missing.png'), /패키지에 없어요/);
  broken((t) => (t.tokens = { accent: 'red; background:url(https://x)' }), /색 토큰/);
  broken((t) => (t.characters.push({ ...t.characters[0] })), /겹쳐요/);
  broken((t) => (t.scene.seats = { writer: { x: 5000, y: 0 } }), /좌표/);
  broken((t) => (t.scene.spots = { safe: { x: 900, y: 400, w: 200, h: 10 } }), /장면을 벗어났어요/);
});

test('safe paths stay inside the package', () => {
  assert.ok(isSafePath('assets/a.png'));
  for (const bad of ['/abs.png', 'a/../b.png', './a.png', 'a\\b.png', 'a//b.png', 'a.svg', 'a.js']) assert.ok(!isSafePath(bad), bad);
});

test('a theme layout only overrides what it gives', () => {
  const layout = mergeLayout({ seats: { writer: { x: 10, y: 20 } }, extraSeats: [{ x: 1, y: 2 }, { x: 3, y: 4 }], spots: {} });
  assert.deepEqual(layout.seats.writer, { x: 10, y: 20 });
  assert.deepEqual(layout.seats.manager, DEFAULT_LAYOUT.seats.manager);
  assert.equal(layout.extraLounge.length, 2, 'every extra seat gets a resting spot');
  assert.deepEqual(layout.spots, DEFAULT_LAYOUT.spots);
  assert.deepEqual(mergeLayout({}), DEFAULT_LAYOUT);
});

test('characters without a head anchor wear hats at the top of the frame', () => {
  assert.deepEqual(parseThemeManifest(minimal(), files).characters[0].head, { x: 0.5, y: 0 });
});

test('pack skins are told apart from built-in skins', () => {
  assert.deepEqual(splitPackSkin('cozy-office:mina'), { themeId: 'cozy-office', characterId: 'mina' });
  assert.equal(splitPackSkin('pinkgirl'), null);
  assert.equal(splitPackSkin('a:b:c'), null);
});
