import assert from 'node:assert/strict';
import test from 'node:test';

const { activeVariant, applyVariant, companyThemeOn, manifestFiles, officeTheme, parseBookings, parseThemeManifest } = await import('../shared/theme-pack.ts');
const { findRoute, firstMatch, inDates, inHours, localText, matches } = await import('../shared/theme-rules.ts');
const { DEFAULT_EMOTES, DEFAULT_INTERACTIONS } = await import('../shared/theme-defaults.ts');
const { mergeLayout } = await import('../web/src/office/theme.ts');

const at = (iso: string) => new Date(iso);

const minimal = (extra: Record<string, unknown> = {}) => ({
  format: 'avataragent-theme',
  version: 1,
  id: 'cozy-office',
  themeVersion: '1.0.0',
  license: 'CC-BY-4.0',
  preview: 'preview.png',
  scene: { layers: [{ image: 'assets/room.png', x: 0, y: 0 }] },
  characters: [{ id: 'mina', sheet: 'assets/mina.png', frames: { a: { x: 0, y: 0, w: 64, h: 96 } }, states: { idle: { frames: ['a'] } } }],
  ...extra,
});
const files = new Set(['preview.png', 'assets/room.png', 'assets/mina.png', 'assets/door.png', 'assets/door-open.png', 'assets/pumpkin.png', 'assets/bat.png', 'assets/coffee.png']);

test('date ranges include both ends and may wrap past new year', () => {
  assert.ok(inDates(['10-24', '10-31'], at('2026-10-24T09:00:00')));
  assert.ok(inDates(['10-24', '10-31'], at('2026-10-31T23:00:00')));
  assert.ok(!inDates(['10-24', '10-31'], at('2026-11-01T00:30:00')));
  assert.ok(inDates(['12-24', '01-02'], at('2027-01-01T12:00:00')));
  assert.ok(!inDates(['12-24', '01-02'], at('2026-12-23T12:00:00')));
});

test('hour ranges are [from, to) and may wrap past midnight', () => {
  assert.ok(inHours([5, 11], at('2026-10-05T05:00:00')));
  assert.ok(!inHours([5, 11], at('2026-10-05T11:00:00')));
  assert.ok(inHours([22, 6], at('2026-10-05T02:00:00')));
  assert.ok(!inHours([22, 6], at('2026-10-05T12:00:00')));
});

test('rules need every condition, and person conditions fail without a person', () => {
  const now = at('2026-10-05T09:00:00');
  assert.ok(matches(undefined, { now }));
  assert.ok(matches({ status: ['working'], hours: [5, 11] }, { status: 'working', now }));
  assert.ok(!matches({ status: ['working'], hours: [12, 13] }, { status: 'working', now }));
  assert.ok(!matches({ role: ['writer'] }, { now }));
  assert.ok(!matches({ walking: false }, { walking: true, now }));
});

test('the first matching rule wins, so the default urgent icons beat happy ones', () => {
  const now = at('2026-10-05T09:00:00');
  const icon = (ctx: Parameters<typeof matches>[1]) => firstMatch(DEFAULT_EMOTES, ctx, (r) => r.icon !== undefined)?.icon;
  assert.equal(icon({ status: 'help_requested', expression: 'celebrate', role: 'writer', now })?.text, '?');
  assert.equal(icon({ status: 'working', expression: 'celebrate', role: 'writer', now })?.text, '⭐');
  assert.equal(icon({ status: 'working', expression: 'normal', role: 'writer', now })?.text, '✏️');
  assert.equal(icon({ status: 'idle', expression: 'normal', role: 'manager', place: 'lounge', walking: true, now }), undefined);
  assert.equal(icon({ status: 'idle', expression: 'normal', role: 'manager', place: 'lounge', walking: false, now })?.text, '☕');
});

test('greeting changes with the time and with how the person is doing', () => {
  const greet = DEFAULT_INTERACTIONS.find((i) => i.id === 'greet')!;
  const say = (ctx: Parameters<typeof matches>[1]) => firstMatch(greet.reactions, ctx)?.say?.map((l) => localText(l, 'ko'));
  assert.ok(say({ status: 'idle', now: at('2026-10-05T08:00:00') })?.includes('좋은 아침이에요!'));
  assert.ok(say({ status: 'idle', now: at('2026-10-05T19:00:00') })?.includes('오늘도 수고 많으셨어요!'));
  assert.ok(say({ status: 'error', now: at('2026-10-05T08:00:00') })?.includes('지금 좀 곤란해요…'));
});

test('local text picks the language, then Korean, then anything', () => {
  assert.equal(localText('안녕', 'en'), '안녕');
  assert.equal(localText({ ko: '안녕', en: 'Hi' }, 'en'), 'Hi');
  assert.equal(localText({ ko: '안녕', en: 'Hi' }, 'ja'), '안녕');
  assert.equal(localText({ en: 'Hi' }, 'zh'), 'Hi');
});

test('routes follow the links between the waypoints nearest each end', () => {
  const paths = {
    waypoints: { a: { x: 100, y: 300 }, b: { x: 500, y: 300 }, c: { x: 500, y: 100 }, d: { x: 900, y: 100 } },
    links: [['a', 'b'], ['b', 'c'], ['c', 'd']] as [string, string][],
  };
  assert.deepEqual(findRoute(paths, { x: 90, y: 320 }, { x: 910, y: 90 }), [
    { x: 100, y: 300 },
    { x: 500, y: 300 },
    { x: 500, y: 100 },
    { x: 900, y: 100 },
    { x: 910, y: 90 },
  ]);
  assert.deepEqual(findRoute(paths, { x: 90, y: 320 }, { x: 110, y: 310 }), [{ x: 110, y: 310 }]);
  assert.deepEqual(findRoute({ waypoints: {}, links: [] }, { x: 0, y: 0 }, { x: 5, y: 5 }), [{ x: 5, y: 5 }]);
  assert.deepEqual(findRoute({ ...paths, links: [] }, { x: 90, y: 320 }, { x: 910, y: 90 }), [{ x: 910, y: 90 }]);
});

test('paths replace the corridor walk and set the speed', () => {
  const layout = mergeLayout({ waypoints: { a: { x: 1, y: 2 } }, links: [], walkSpeed: 120 });
  assert.equal(layout.passage, null);
  assert.equal(layout.walkSpeed, 120);
  assert.notEqual(mergeLayout({}).passage, null);
});

test('emotes, interactions, props, events and paths parse and round-trip', () => {
  const theme = parseThemeManifest(
    minimal({
      scene: {
        layers: [{ image: 'assets/room.png', x: 0, y: 0 }],
        waypoints: { hall: { x: 500, y: 250 }, door: { x: 950, y: 230 } },
        links: [['hall', 'door']],
        walkSpeed: 140,
      },
      emotes: [
        { when: { place: 'lounge', hours: [12, 13] }, icon: '🍱', say: ['점심 맛있다', { ko: '배불러', en: 'So full' }], every: 30 },
        { when: { status: ['working'], character: ['mina'] }, icon: { image: 'assets/coffee.png' } },
        { when: { status: 'paused' }, icon: null },
      ],
      interactions: [
        { id: 'snack', label: { ko: '간식 주기', en: 'Give a snack' }, when: { place: 'lounge' }, reactions: [{ state: 'smile', say: ['고마워요!'], effect: 'hearts' }] },
        { id: 'greet', hidden: true },
      ],
      props: [{ id: 'door', image: 'assets/door.png', x: 900, y: 140, spot: 'door', states: { open: 'assets/door-open.png' } }],
      events: [{ on: 'task.completed', when: { role: ['manager'] }, state: 'celebrate', effect: 'confetti', replace: true, prop: { id: 'door', state: 'open' } }],
    }),
    files,
  );
  assert.deepEqual(theme.emotes[0].when, { place: ['lounge'], hours: [12, 13] });
  assert.equal(theme.emotes[0].icon?.text, '🍱');
  assert.equal(theme.emotes[2].icon, null);
  assert.equal(theme.interactions[1].hidden, true);
  assert.equal(theme.props[0].spot, 'door');
  assert.deepEqual(theme.events[0].prop, { id: 'door', state: 'open', ms: 1500 });
  assert.deepEqual(theme.scene.links, [['hall', 'door']]);
  assert.deepEqual(parseThemeManifest(JSON.parse(JSON.stringify(theme)), files), theme);
  for (const path of ['assets/coffee.png', 'assets/door.png', 'assets/door-open.png']) assert.ok(manifestFiles(theme).includes(path), path);
});

test('bad rules are refused with a reason', () => {
  const bad = (extra: Record<string, unknown>, pattern: RegExp) => assert.throws(() => parseThemeManifest(minimal(extra), files), pattern);
  bad({ emotes: [{ when: { status: ['dancing'] }, icon: '!' }] }, /status 조건 값 dancing/);
  bad({ emotes: [{ when: { dates: ['13-01', '13-02'] }, icon: '!' }] }, /MM-DD/);
  bad({ emotes: [{ when: { place: 'lounge' } }] }, /icon이나 say/);
  bad({ interactions: [{ id: 'hug', label: '안기', reactions: [{ state: 'dance' }] }] }, /없는 동작/);
  bad({ interactions: [{ id: 'hug', label: '안기', reactions: [] }] }, /반응이 하나 이상/);
  bad({ events: [{ on: 'office.exploded' }] }, /없는 이벤트/);
  bad({ props: [{ id: 'door', image: 'assets/missing.png', x: 0, y: 0 }] }, /패키지에 없어요/);
  bad({ scene: { layers: [{ image: 'assets/room.png', x: 0, y: 0 }], waypoints: { a: { x: 1, y: 1 } }, links: [['a', 'b']] } }, /있는 지점 두 개/);
  bad({ variants: [{ id: 'halloween', when: { status: ['idle'] } }] }, /dates, weekdays, hours만/);
});

test('a dated variant overrides parts of the theme while its dates hold', () => {
  const theme = parseThemeManifest(
    minimal({
      props: [{ id: 'door', image: 'assets/door.png', x: 900, y: 140 }],
      emotes: [{ icon: '☕' }],
      variants: [
        {
          id: 'halloween',
          name: '할로윈',
          when: { dates: ['10-24', '10-31'] },
          addLayers: [{ image: 'assets/bat.png', x: 0, y: 0, front: true }],
          props: [{ id: 'door', image: 'assets/pumpkin.png', x: 900, y: 140 }],
          wear: [{ image: 'assets/pumpkin.png', at: 'head' }],
          emotes: [{ icon: '🎃' }],
        },
      ],
    }),
    files,
  );
  assert.equal(activeVariant(theme, at('2026-10-05T12:00:00')), undefined);
  const variant = activeVariant(theme, at('2026-10-30T12:00:00'));
  assert.equal(variant?.id, 'halloween');
  const spooky = applyVariant(theme, variant);
  assert.equal(spooky.scene.layers.length, 2);
  assert.equal(spooky.props[0].image, 'assets/pumpkin.png');
  assert.equal(spooky.emotes[0].icon?.text, '🎃');
  assert.equal(spooky.wear?.[0].image, 'assets/pumpkin.png');
  assert.equal(applyVariant(theme, undefined), theme);
  assert.ok(manifestFiles(theme).includes('assets/bat.png'));
});

test('the site look parses, lists its files and changes with the season', () => {
  const siteFiles = new Set([...files, 'assets/paper.png', 'fonts/hand.woff2']);
  const theme = parseThemeManifest(
    minimal({
      tokens: { topbar: '#203040', tab: '#eeeeee', surface: '#fffaf5' },
      site: { font: { file: 'fonts/hand.woff2' }, radius: 6, background: { image: 'assets/paper.png', repeat: true } },
      variants: [{ id: 'halloween', when: { dates: ['10-24', '10-31'] }, tokens: { topbar: '#2b1a3d', note: '#ffb347' }, site: { font: 'rounded' } }],
    }),
    siteFiles,
  );
  assert.deepEqual(theme.site, { font: { file: 'fonts/hand.woff2' }, radius: 6, background: { image: 'assets/paper.png', repeat: true } });
  assert.equal(theme.tokens.topbar, '#203040');
  assert.ok(manifestFiles(theme).includes('fonts/hand.woff2'));
  assert.ok(manifestFiles(theme).includes('assets/paper.png'));

  const spooky = applyVariant(theme, activeVariant(theme, at('2026-10-30T12:00:00')));
  assert.equal(spooky.tokens.topbar, '#2b1a3d');
  assert.equal(spooky.tokens.tab, '#eeeeee');
  assert.equal(spooky.tokens.note, '#ffb347');
  assert.equal(spooky.site.font, 'rounded');
  assert.equal(spooky.site.radius, 6);

  assert.deepEqual(parseThemeManifest(minimal(), files).site, {});
  assert.throws(() => parseThemeManifest(minimal({ site: { radius: 40 } }), files), /0~20/);
  assert.throws(() => parseThemeManifest(minimal({ site: { font: { file: 'assets/room.png' } } }), files), /woff2/);
  assert.throws(() => parseThemeManifest(minimal({ site: { font: { file: 'fonts/hand.woff2' } } }), files), /패키지에 없어요/);
  assert.throws(() => parseThemeManifest(minimal({ tokens: { topbar: 'url(x)' } }), files), /topbar/);
});

test('booked company themes show on their dates unless the office picked its own', () => {
  const bookings = parseBookings([{ theme: 'spooky-office', from: '10-24', to: '10-31' }]);
  assert.equal(companyThemeOn('cozy-office', bookings, at('2026-10-25T12:00:00')), 'spooky-office');
  assert.equal(companyThemeOn('cozy-office', bookings, at('2026-11-02T12:00:00')), 'cozy-office');
  assert.equal(officeTheme({}, 'cozy-office', bookings, at('2026-10-25T12:00:00')), 'spooky-office');
  assert.equal(officeTheme({ theme: 'mine' }, 'cozy-office', bookings, at('2026-10-25T12:00:00')), 'mine');
  assert.throws(() => parseBookings([{ theme: 'x', from: '10-24', to: '10-31' }]), /테마가 올바르지/);
  assert.throws(() => parseBookings([{ theme: 'spooky-office', from: '10/24', to: '10-31' }]), /MM-DD/);
});
