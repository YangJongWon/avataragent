import assert from 'node:assert/strict';
import test from 'node:test';

const { STATE_FALLBACK, THEME_STATES, accessoriesFor, adoptCompanyTheme, characterFor, officeTheme, isSafePath, manifestFiles, parseThemeManifest, portraitFor, resolveState, splitPackSkin } = await import(
  '../shared/theme-pack.ts'
);
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

test('work and lounge spaces get their own backgrounds, and people walk straight between them', () => {
  const scene = {
    ...minimal().scene,
    layers: [
      { image: 'assets/room.png', x: 0, y: 0, area: 'work' },
      { image: 'assets/room.png', x: 760, y: 0, area: 'lounge' },
      { image: 'assets/room.png', x: 0, y: 0, area: 'kitchen' },
    ],
    areas: { work: { x: 0, y: 0, w: 760, h: 480 }, lounge: { x: 760, y: 0, w: 240, h: 480 }, kitchen: { x: 0, y: 0, w: 1, h: 1 } },
  };
  const parsed = parseThemeManifest({ ...minimal(), scene }, files).scene;
  assert.deepEqual(parsed.layers.map((l) => l.area), ['work', 'lounge', undefined]);
  assert.deepEqual(Object.keys(parsed.areas), ['work', 'lounge']);
  assert.equal(mergeLayout(parsed).passage, null);
  assert.deepEqual(mergeLayout({ door: { x: 5, y: 6 } }).passage, { x: 5, y: 6 }, 'without spaces the door is the way through');
  assert.throws(() => parseThemeManifest({ ...minimal(), scene: { ...scene, areas: { lounge: { x: 900, y: 0, w: 240, h: 480 } } } }, files), /벗어났어요/);
});

test('characters without a head anchor wear hats at the top of the frame', () => {
  assert.deepEqual(parseThemeManifest(minimal(), files).characters[0].head, { x: 0.5, y: 0 });
});

test('agents appear as the character they picked, otherwise one by role', () => {
  const t = minimal() as any;
  t.characters.push({ ...t.characters[0], id: 'jun', name: 'Jun' });
  const theme = parseThemeManifest(t, files);
  assert.equal(characterFor(theme, 'cozy-office:jun', 'manager').id, 'jun');
  assert.equal(characterFor(theme, 'other-theme:jun', 'manager').id, 'mina', 'a pick from another theme falls back to the role');
  assert.equal(characterFor(theme, 'pixel', 'researcher').id, 'jun');
  assert.equal(characterFor(theme, 'cozy-office:gone', 'writer').id, 'mina');
});

test('portraits fall back along the expression chain, then to normal', () => {
  const character = { portraits: { smile: 'a/smile.png', troubled: 'a/troubled.png' } } as any;
  assert.equal(portraitFor(character, 'smile'), 'a/smile.png');
  assert.equal(portraitFor(character, 'celebrate'), 'a/smile.png');
  assert.equal(portraitFor(character, 'panic'), 'a/troubled.png');
  assert.equal(portraitFor(character, 'focus'), null);
  assert.equal(portraitFor({ portraits: { normal: 'n.png' } } as any, 'focus'), 'n.png');
});

test('accessories stack by tier and fall back to the any-company set', () => {
  const t = minimal() as any;
  t.accessories = {
    claude: { '1': [{ image: 'assets/room.png', at: 'head', x: -8, y: 2 }], '3': [{ image: 'assets/mina.png', at: 'hand', scale: 0.5 }] },
    '*': { '2': [{ image: 'assets/room.png' }] },
  };
  const theme = parseThemeManifest(t, files);
  assert.equal(accessoriesFor(theme.accessories, 'claude', 1)?.length, 1);
  assert.equal(accessoriesFor(theme.accessories, 'claude', 2)?.length, 1, 'claude has no tier 2 layer of its own');
  assert.deepEqual(accessoriesFor(theme.accessories, 'claude', 3)?.map((l) => l.at), ['head', 'hand']);
  assert.deepEqual(accessoriesFor(theme.accessories, 'gpt', 1), [], 'the any-company set starts at tier 2, so tier 1 wears nothing, not a pixel hat');
  assert.equal(accessoriesFor(theme.accessories, 'gpt', 3)?.length, 1);
  assert.equal(accessoriesFor(parseThemeManifest(minimal(), files).accessories, 'claude', 3), null);
  assert.deepEqual(theme.characters[0].hand, { x: 0.8, y: 0.6 });
  assert.ok(manifestFiles(theme).includes('assets/mina.png'));

  const broken = (accessories: unknown, message: RegExp) => assert.throws(() => parseThemeManifest({ ...minimal(), accessories }, files), message);
  broken({ 'Bad Name': { '1': [] } }, /모델사 이름/);
  broken({ claude: { '1': [{ image: '../x.png' }] } }, /경로/);
  broken({ claude: { '1': 'nope' } }, /목록/);
});

test('pack skins are told apart from built-in skins', () => {
  assert.deepEqual(splitPackSkin('cozy-office:mina'), { themeId: 'cozy-office', characterId: 'mina' });
  assert.equal(splitPackSkin('pinkgirl'), null);
  assert.equal(splitPackSkin('a:b:c'), null);
});

test('offices share the company theme unless they picked their own', () => {
  assert.equal(officeTheme({}, 'cozy-office'), 'cozy-office');
  assert.equal(officeTheme({ theme: 'pixel' }, 'cozy-office'), 'pixel');
  assert.equal(officeTheme({}, undefined), 'pixel');
});

test('per-office themes from before become the shared one most offices used', () => {
  const offices: { theme?: string }[] = [{ theme: 'cozy-office' }, {}, { theme: 'cozy-office' }, { theme: 'night' }];
  assert.equal(adoptCompanyTheme(offices), 'cozy-office');
  assert.deepEqual(offices, [{}, {}, {}, { theme: 'night' }]);
  assert.equal(adoptCompanyTheme([{}, {}]), 'pixel');
});
