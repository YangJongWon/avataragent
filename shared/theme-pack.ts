import { isLanguage } from './i18n.ts';
import { TEAMS } from './teams.ts';
import { inDates, isMonthDay, matches, type LocalText, type When } from './theme-rules.ts';
import type { AgentStatus, Expression, Role, TeamId } from './types.ts';

/**
 * A shareable look for an office: a background scene and characters with a default and per-event states.
 * Packages are untrusted (anyone can make one), so everything here validates and drops unknown fields.
 * No dependencies beyond shared/, so the community service can reuse the same checks.
 */
export const THEME_FORMAT = 'avataragent-theme';
/** Themes that ship with the app (drawn in code); packages cannot take these ids. */
export const BUILTIN_THEMES = ['pixel'] as const;
export const DEFAULT_THEME = 'pixel';

export const THEME_LIMITS = {
  zipBytes: 20 * 1024 * 1024,
  files: 300,
  imagePx: 4096,
  cssBytes: 64 * 1024,
  framesPerState: 32,
  characters: 16,
  layers: 32,
  emotes: 64,
  interactions: 16,
  props: 32,
  events: 64,
  variants: 12,
  waypoints: 48,
  links: 128,
} as const;

export const THEME_FILE_EXTS = ['png', 'webp', 'json', 'css', 'txt', 'woff2'] as const;

/** Logical scene size; same as OfficeScene's SCENE_W/SCENE_H. */
export const THEME_SCENE = { w: 1000, h: 480 } as const;

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  w: number;
  h: number;
}

/** The two spaces of an office: desks where people work, and the lounge where they rest. */
export const AREA_NAMES = ['work', 'lounge'] as const;
export type AreaName = (typeof AREA_NAMES)[number];

export interface SceneLayer extends Point {
  image: string;
  /** In front of characters (plants, desk fronts) instead of behind them. */
  front: boolean;
  /** The background of one space; team colors tint the work space only. */
  area?: AreaName;
}

/** Furniture the office reacts to: the board shows the task, papers fly to the archive, coins to the safe. */
export const SPOT_NAMES = ['board', 'shelf', 'safe', 'archive'] as const;
export type SpotName = (typeof SPOT_NAMES)[number];

/** Where people sit and rest. Anything a theme leaves out comes from the default layout. */
export interface SceneLayout {
  seats: Partial<Record<Role, Point>>;
  lounge: Partial<Record<Role, Point>>;
  /** Seats for staff hired beyond the first person of each role, in fill order, paired with extraLounge. */
  extraSeats: Point[];
  extraLounge: Point[];
  door: Point | null;
  spots: Partial<Record<SpotName, Rect>>;
  /** Where each space is. With both given, people walk straight between them instead of through the door. */
  areas: Partial<Record<AreaName, Rect>>;
  /** Named points people walk through, joined by `links`; with them, people follow the paths instead of walking straight. */
  waypoints: Record<string, Point>;
  links: [string, string][];
  /** Walking speed in scene pixels a second. */
  walkSpeed: number | null;
}

export interface ThemeScene extends SceneLayout {
  layers: SceneLayer[];
  scaleMode: 'nearest' | 'linear';
  teamTint: Partial<Record<TeamId, string>>;
}

export interface StateClip {
  frames: string[];
  fps: number;
  loop: boolean;
}

export interface ThemeCharacter {
  id: string;
  name: string;
  sheet: string;
  frames: Record<string, Rect>;
  /** Feet position inside a frame, as 0..1 of its size. */
  anchor: Point;
  /** Top of the head inside a frame, as 0..1 of its size; hats and accessories sit here. */
  head: Point;
  /** The hand that holds things (a wand), as 0..1 of a frame. */
  hand: Point;
  scale: number;
  states: Partial<Record<ThemeState, StateClip>> & { idle: StateClip };
  portraits: Partial<Record<Expression, string>>;
}

/** A picture worn on the head or held in the hand, offset in scene pixels from that point. */
export interface AccessoryLayer {
  image: string;
  at: 'head' | 'hand';
  x: number;
  y: number;
  scale: number;
}

export type AccessoryTier = '1' | '2' | '3';
/**
 * What staff wear to show their AI company and model tier, replacing the pixel hat: company id (or `*` for any
 * company) → tier → layers. Tiers add up, so a tier 3 model wears the tier 1, 2 and 3 layers.
 */
export type Accessories = Record<string, Partial<Record<AccessoryTier, AccessoryLayer[]>>>;

/**
 * Colors of the whole site, as CSS variables of the same name. The first ones color everything;
 * the rest are surfaces: the top bar, tabs, cards and buttons, notes, and what the pointer is over.
 */
export const TOKEN_NAMES = [
  'ink', 'paper', 'bg', 'line', 'accent', 'primary', 'green', 'red', 'blue', 'yellow', 'muted',
  'surface', 'topbar', 'topbarInk', 'topbarLine', 'tabBar', 'tab', 'note', 'hover',
] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];

export const SITE_FONTS = ['default', 'rounded', 'serif', 'mono'] as const;
export type SiteFont = (typeof SITE_FONTS)[number];

/** The look of the site around the office: lettering, corners and a picture behind the page. */
export interface SiteLook {
  /** A font that ships with most computers, or a `.woff2` file in the package. */
  font?: SiteFont | { file: string };
  /** Corner rounding of boxes and buttons in pixels; the app's own look is square. */
  radius?: number;
  /** Shown behind the page, tiled (`repeat`) or covering it. */
  background?: { image: string; repeat: boolean };
}

/** A badge over a head: a short text or emoji, or a picture; `color` puts the text on a round badge. */
export interface IconSpec {
  text?: string;
  image?: string;
  color?: string;
}

export const EFFECT_NAMES = ['sparkle', 'hearts', 'sweat', 'notes', 'confetti', 'zzz'] as const;
export type EffectName = (typeof EFFECT_NAMES)[number];

/** What floats over a person while `when` holds: an icon (null hides it) and lines they now and then say. */
export interface EmoteRule {
  when?: When;
  icon?: IconSpec | null;
  say?: LocalText[];
  /** Say a line again every this many seconds while the rule holds; otherwise only when it starts to hold. */
  every?: number;
}

/** How a person answers an interaction, or reacts to an event. */
export interface Reaction {
  when?: When;
  state?: ThemeState;
  say?: LocalText[];
  effect?: EffectName;
}

/** A menu item for being friendly (greet, give a snack). It only plays a reaction; it never touches work or data. */
export interface Interaction {
  id: string;
  label: LocalText;
  /** Shown in the menu only while this holds for the person. */
  when?: When;
  hidden: boolean;
  reactions: Reaction[];
}

/** A piece of furniture drawn on its own, with optional pictures per state (a door's `open`). */
export interface ThemeProp extends Point {
  id: string;
  image: string;
  front: boolean;
  area?: AreaName;
  /** The office spot it stands for; a `door` prop shows its `open` state while someone walks through. */
  spot?: SpotName | 'door';
  states: Record<string, string>;
}

/** Office events a theme can react to. `agent.arrived` and `agent.left` happen at the door. */
export const THEME_EVENTS = [
  'task.created',
  'task.completed',
  'task.handed_off',
  'review.rejected',
  'review.approved',
  'approval.requested',
  'approval.denied',
  'agent.help_received',
  'value.recognized',
  'mail.received',
  'inquiry.received',
  'budget.exceeded',
  'cost.recorded',
  'agent.arrived',
  'agent.left',
] as const;
export type ThemeEvent = (typeof THEME_EVENTS)[number];

/** A theme's reaction to an office event. `replace` turns off the app's own effect for it (stamps, coins, sparkles). */
export interface EventRule extends Reaction {
  on: ThemeEvent;
  prop?: { id: string; state: string; ms: number };
  replace: boolean;
}

/** A dated look of the same theme, such as Halloween: only time conditions apply, and it overrides parts of the theme. */
export interface ThemeVariant {
  id: string;
  name: string;
  when: When;
  layers?: SceneLayer[];
  addLayers?: SceneLayer[];
  props?: ThemeProp[];
  characters?: ThemeCharacter[];
  accessories?: Accessories;
  /** Worn by everyone on top of the model accessories (a pumpkin hat). */
  wear?: AccessoryLayer[];
  emotes?: EmoteRule[];
  interactions?: Interaction[];
  events?: EventRule[];
  /** Site colors and look for the season, over the theme's own. */
  tokens?: Partial<Record<TokenName, string>>;
  site?: SiteLook;
}

export interface ThemeManifest {
  format: typeof THEME_FORMAT;
  version: 1;
  id: string;
  themeVersion: string;
  name: string;
  author: string;
  license: string;
  description: string;
  preview: string;
  scene: ThemeScene;
  characters: ThemeCharacter[];
  tokens: Partial<Record<TokenName, string>>;
  site: SiteLook;
  css: string | null;
  accessories: Accessories;
  emotes: EmoteRule[];
  interactions: Interaction[];
  props: ThemeProp[];
  events: EventRule[];
  variants: ThemeVariant[];
  /** Applied by the app for a dated variant; never in a package. */
  wear?: AccessoryLayer[];
}

/**
 * Every state a character may define, each pointing to the one used when it is missing.
 * Chains always end at `idle`, so a theme with a single idle frame already works everywhere.
 */
export const STATE_FALLBACK = {
  idle: null,
  walk: 'idle',
  sit: 'idle',
  // seen from behind: walking away, or standing at the board, shelf or door
  back: 'idle',
  walk_back: 'walk',
  // agent status
  working: 'sit',
  collaborating: 'working',
  waiting: 'idle',
  awaiting_approval: 'waiting',
  help_requested: 'troubled',
  paused: 'idle',
  error: 'panic',
  // expression
  smile: 'idle',
  focus: 'working',
  sweat: 'troubled',
  troubled: 'idle',
  panic: 'sweat',
  thanks: 'smile',
  celebrate: 'smile',
  // moments in a task
  'step.brief': 'working',
  'step.research': 'focus',
  'step.draft': 'working',
  'step.review': 'focus',
  'review.rejected': 'troubled',
  'task.approved': 'celebrate',
  'budget.exceeded': 'panic',
} as const satisfies Record<string, string | null>;

export type ThemeState = keyof typeof STATE_FALLBACK;
export const THEME_STATES = Object.keys(STATE_FALLBACK) as ThemeState[];
export const isThemeState = (v: unknown): v is ThemeState => typeof v === 'string' && v in STATE_FALLBACK;

/** The state actually played for `wanted`, following the fallback chain. */
export function resolveState(states: ThemeCharacter['states'], wanted: ThemeState): ThemeState {
  let state: ThemeState | null = wanted;
  while (state) {
    if (states[state]) return state;
    state = STATE_FALLBACK[state];
  }
  return 'idle';
}

const EXPRESSIONS: Expression[] = ['normal', 'smile', 'focus', 'sweat', 'troubled', 'panic', 'thanks', 'celebrate'];
const ROLES: Role[] = ['manager', 'researcher', 'writer', 'reviewer'];

const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
const SEMVER = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
/** Plain colors only: token values end up inside a style attribute. */
const COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\(\s*[\d.%\s,/]+\))$/i;

const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);

const fail = (message: string): never => {
  throw new Error(`테마 파일 오류: ${message}`);
};

/** A package-relative file path: no absolute paths, no `..`, an allowed extension. */
export function isSafePath(path: string) {
  if (!path || path.length > 200 || path.startsWith('/') || path.includes('\\') || path.includes('\0')) return false;
  if (path.split('/').some((part) => part === '' || part === '.' || part === '..')) return false;
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return (THEME_FILE_EXTS as readonly string[]).includes(ext);
}

const isImage = (path: string) => /\.(png|webp)$/i.test(path);

function filePath(v: unknown, where: string, files: ReadonlySet<string> | null, image = true) {
  const path = str(v, 200);
  if (!isSafePath(path) || (image && !isImage(path))) fail(`${where}의 파일 경로가 올바르지 않아요 (${path || '비어 있음'}).`);
  if (files && !files.has(path)) fail(`${where}이(가) 가리키는 ${path} 파일이 패키지에 없어요.`);
  return path;
}

function point(v: unknown, where: string, w: number = THEME_SCENE.w, h: number = THEME_SCENE.h): Point {
  const p = obj(v);
  const x = num(p.x, 0, w);
  const y = num(p.y, 0, h);
  if (x === null || y === null) fail(`${where} 좌표가 범위를 벗어났어요.`);
  return { x: x!, y: y! };
}

const areaOf = (v: unknown) => ((AREA_NAMES as readonly unknown[]).includes(v) ? (v as AreaName) : undefined);

function parseLayers(input: unknown, where: string, files: ReadonlySet<string> | null): SceneLayer[] {
  const layersIn = Array.isArray(input) ? input : [];
  if (layersIn.length > THEME_LIMITS.layers) fail(`${where}는 ${THEME_LIMITS.layers}개까지예요.`);
  return layersIn.map((item, i) => {
    const l = obj(item);
    const at = point(l, `${where} ${i + 1}`, THEME_SCENE.w, THEME_SCENE.h);
    const area = areaOf(l.area);
    return { image: filePath(l.image, `${where} ${i + 1}`, files), x: at.x, y: at.y, front: l.front === true, ...(area && { area }) };
  });
}

const WAYPOINT = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function parsePaths(rawWaypoints: unknown, rawLinks: unknown) {
  const entries = Object.entries(obj(rawWaypoints));
  if (entries.length > THEME_LIMITS.waypoints) fail(`이동 경로 지점은 ${THEME_LIMITS.waypoints}개까지예요.`);
  const waypoints: Record<string, Point> = {};
  for (const [id, p] of entries) {
    if (!WAYPOINT.test(id)) fail(`이동 경로 지점 이름 ${id.slice(0, 40)}이(가) 올바르지 않아요.`);
    waypoints[id] = point(p, `이동 경로 지점 ${id}`);
  }
  const linksIn = Array.isArray(rawLinks) ? rawLinks : [];
  if (linksIn.length > THEME_LIMITS.links) fail(`이동 경로 연결은 ${THEME_LIMITS.links}개까지예요.`);
  const links = linksIn.map((link, i): [string, string] => {
    const pair = Array.isArray(link) ? link : [];
    if (pair.length !== 2 || !(pair[0] in waypoints) || !(pair[1] in waypoints)) fail(`이동 경로 연결 ${i + 1}은(는) 있는 지점 두 개를 이어야 해요.`);
    return [pair[0], pair[1]];
  });
  return { waypoints, links };
}

function parseScene(input: unknown, files: ReadonlySet<string> | null): ThemeScene {
  const raw = obj(input);
  const layers = parseLayers(raw.layers, '배경 레이어', files);
  if (!layers.length) fail('배경 레이어가 하나 이상 있어야 해요.');
  const byRole = (input: unknown, label: string) => {
    const from = obj(input);
    const out: Partial<Record<Role, Point>> = {};
    for (const role of ROLES) if (role in from) out[role] = point(from[role], `${role} ${label}`);
    return out;
  };
  const points = (input: unknown, label: string) =>
    (Array.isArray(input) ? input : []).slice(0, 8).map((p, i) => point(p, `${label} ${i + 1}`));
  const rects = <N extends string>(input: unknown, names: readonly N[]) => {
    const from = obj(input);
    const out: Partial<Record<N, Rect>> = {};
    for (const name of names) {
      if (!(name in from)) continue;
      const at = point(from[name], name);
      const size = obj(from[name]);
      const w = num(size.w, 1, THEME_SCENE.w - at.x);
      const h = num(size.h, 1, THEME_SCENE.h - at.y);
      if (w === null || h === null) fail(`${name} 크기가 장면을 벗어났어요.`);
      out[name] = { ...at, w: w!, h: h! };
    }
    return out;
  };
  const spots = rects(raw.spots, SPOT_NAMES);
  const tintIn = obj(raw.teamTint);
  const teamTint: ThemeScene['teamTint'] = {};
  for (const team of Object.keys(TEAMS) as TeamId[]) {
    const color = str(tintIn[team], 40);
    if (color && COLOR.test(color)) teamTint[team] = color;
  }
  return {
    layers,
    seats: byRole(raw.seats, '좌석'),
    lounge: byRole(raw.lounge, '휴게 자리'),
    extraSeats: points(raw.extraSeats, '추가 좌석'),
    extraLounge: points(raw.extraLounge, '추가 휴게 자리'),
    door: raw.door === undefined || raw.door === null ? null : point(raw.door, '문'),
    spots,
    areas: rects(raw.areas, AREA_NAMES),
    ...parsePaths(raw.waypoints, raw.links),
    walkSpeed: num(raw.walkSpeed, 40, 600),
    scaleMode: raw.scaleMode === 'nearest' ? 'nearest' : 'linear',
    teamTint,
  };
}

function parseCharacter(input: unknown, index: number, files: ReadonlySet<string> | null): ThemeCharacter {
  const raw = obj(input);
  const where = `캐릭터 ${index + 1}`;
  const id = str(raw.id, 40);
  if (!SLUG.test(id)) fail(`${where}의 id는 영어 소문자·숫자·하이픈으로 2~40자여야 해요.`);

  const frames: Record<string, Rect> = {};
  for (const [name, value] of Object.entries(obj(raw.frames)).slice(0, 512)) {
    const f = obj(value);
    const max = THEME_LIMITS.imagePx;
    const x = num(f.x, 0, max);
    const y = num(f.y, 0, max);
    const w = num(f.w, 1, max);
    const h = num(f.h, 1, max);
    if (x === null || y === null || w === null || h === null || name.length > 60) fail(`${where}의 프레임 ${name}이(가) 올바르지 않아요.`);
    frames[name] = { x: x!, y: y!, w: w!, h: h! };
  }

  const states: Partial<Record<ThemeState, StateClip>> = {};
  for (const [name, value] of Object.entries(obj(raw.states))) {
    if (!isThemeState(name)) continue;
    const s = obj(value);
    const list = (Array.isArray(s.frames) ? s.frames : []).filter((f): f is string => typeof f === 'string');
    if (!list.length || list.length > THEME_LIMITS.framesPerState) fail(`${where}의 ${name} 상태는 프레임이 1~${THEME_LIMITS.framesPerState}개여야 해요.`);
    const missing = list.find((f) => !(f in frames));
    if (missing) fail(`${where}의 ${name} 상태가 없는 프레임 ${missing}을(를) 써요.`);
    states[name] = { frames: list, fps: num(s.fps, 1, 30) ?? 6, loop: s.loop !== false };
  }
  if (!states.idle) fail(`${where}에 기본 상태(idle)가 없어요.`);

  const portraitsIn = obj(raw.portraits);
  const portraits: ThemeCharacter['portraits'] = {};
  for (const expression of EXPRESSIONS) {
    if (portraitsIn[expression] !== undefined) portraits[expression] = filePath(portraitsIn[expression], `${where}의 ${expression} 초상화`, files);
  }

  const anchor = obj(raw.anchor);
  const head = obj(raw.head);
  const hand = obj(raw.hand);
  return {
    id,
    name: str(raw.name, 40) || id,
    sheet: filePath(raw.sheet, `${where}의 스프라이트 시트`, files),
    frames,
    anchor: { x: num(anchor.x, 0, 1) ?? 0.5, y: num(anchor.y, 0, 1) ?? 1 },
    head: { x: num(head.x, 0, 1) ?? 0.5, y: num(head.y, 0, 1) ?? 0 },
    hand: { x: num(hand.x, 0, 1) ?? 0.8, y: num(hand.y, 0, 1) ?? 0.6 },
    scale: num(raw.scale, 0.05, 16) ?? 1,
    states: states as ThemeCharacter['states'],
    portraits,
  };
}

const COMPANY_KEY = /^([a-z0-9][a-z0-9_-]{0,39}|\*)$/;
const ACCESSORY_TIERS: AccessoryTier[] = ['1', '2', '3'];

function parseAccessories(input: unknown, files: ReadonlySet<string> | null): Accessories {
  const entries = Object.entries(obj(input));
  if (entries.length > 16) fail('소품은 모델사 16곳까지 정할 수 있어요.');
  const out: Accessories = {};
  for (const [company, value] of entries) {
    if (!COMPANY_KEY.test(company)) fail(`소품의 모델사 이름 ${company.slice(0, 40)}이(가) 올바르지 않아요.`);
    const tiers = obj(value);
    const set: Accessories[string] = {};
    for (const tier of ACCESSORY_TIERS) {
      if (tiers[tier] === undefined) continue;
      const list = tiers[tier];
      if (!Array.isArray(list) || list.length > 8) fail(`${company} 소품 ${tier}등급은 레이어 8개까지의 목록이어야 해요.`);
      set[tier] = (list as unknown[]).map((item, i) => accessoryLayer(item, `${company} 소품 ${tier}등급 ${i + 1}`, files));
    }
    if (Object.keys(set).length) out[company] = set;
  }
  return out;
}

function accessoryLayer(item: unknown, where: string, files: ReadonlySet<string> | null): AccessoryLayer {
  const layer = obj(item);
  return {
    image: filePath(layer.image, where, files),
    at: layer.at === 'hand' ? 'hand' : 'head',
    x: num(layer.x, -512, 512) ?? 0,
    y: num(layer.y, -512, 512) ?? 0,
    scale: num(layer.scale, 0.05, 8) ?? 1,
  };
}

const AGENT_STATUSES: AgentStatus[] = [
  'idle', 'waiting', 'working', 'collaborating', 'awaiting_approval', 'help_requested', 'paused', 'off_duty', 'capacity_exhausted', 'error',
];
const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);

function allowed<T>(v: unknown, values: readonly T[], where: string): T[] | undefined {
  if (v === undefined) return undefined;
  const list = listOf(v);
  const bad = list.find((x) => !values.includes(x as T));
  if (!list.length || list.length > 32 || bad !== undefined) fail(`${where} 조건 값 ${String(bad ?? '')}을(를) 알 수 없어요.`);
  return list as T[];
}

function parseWhen(input: unknown, where: string): When | undefined {
  if (input === undefined || input === null) return undefined;
  const raw = obj(input);
  const when: When = {};
  const status = allowed(raw.status, AGENT_STATUSES, `${where}의 status`);
  const place = allowed(raw.place, ['desk', 'lounge'] as const, `${where}의 place`);
  const role = allowed(raw.role, ROLES, `${where}의 role`);
  const expression = allowed(raw.expression, EXPRESSIONS, `${where}의 expression`);
  const team = allowed(raw.team, Object.keys(TEAMS) as TeamId[], `${where}의 team`);
  const weekdays = allowed(raw.weekdays, [0, 1, 2, 3, 4, 5, 6], `${where}의 weekdays`);
  if (status) when.status = status;
  if (place) when.place = place;
  if (role) when.role = role;
  if (expression) when.expression = expression;
  if (team) when.team = team;
  if (weekdays) when.weekdays = weekdays;
  if (raw.character !== undefined) {
    const list = listOf(raw.character);
    if (!list.length || list.length > 16 || list.some((c) => typeof c !== 'string' || !SLUG.test(c))) fail(`${where}의 character 조건이 올바르지 않아요.`);
    when.character = list as string[];
  }
  if (typeof raw.walking === 'boolean') when.walking = raw.walking;
  if (raw.hours !== undefined) {
    const h = Array.isArray(raw.hours) ? raw.hours : [];
    const from = num(h[0], 0, 24);
    const to = num(h[1], 0, 24);
    if (h.length !== 2 || from === null || to === null) fail(`${where}의 hours는 [시작 시, 끝 시] (0~24)여야 해요.`);
    when.hours = [from!, to!];
  }
  if (raw.dates !== undefined) {
    const d = Array.isArray(raw.dates) ? raw.dates : [];
    if (d.length !== 2 || !isMonthDay(d[0]) || !isMonthDay(d[1])) fail(`${where}의 dates는 ["10-24", "10-31"] 같은 MM-DD 두 개여야 해요.`);
    when.dates = [d[0], d[1]];
  }
  return Object.keys(when).length ? when : undefined;
}

function localTextOf(v: unknown, where: string, max = 120): LocalText {
  if (typeof v === 'string') {
    const text = str(v, max);
    if (!text) fail(`${where} 문구가 비어 있어요.`);
    return text;
  }
  const out: Partial<Record<string, string>> = {};
  for (const [language, value] of Object.entries(obj(v))) {
    const text = str(value, max);
    if (isLanguage(language) && text) out[language] = text;
  }
  if (!Object.keys(out).length) fail(`${where} 문구가 비어 있어요.`);
  return out;
}

function sayOf(v: unknown, where: string): LocalText[] | undefined {
  if (v === undefined) return undefined;
  const list = listOf(v);
  if (!list.length || list.length > 16) fail(`${where}의 say는 문구 1~16개여야 해요.`);
  return list.map((line, i) => localTextOf(line, `${where} ${i + 1}번째`));
}

function iconOf(v: unknown, where: string, files: ReadonlySet<string> | null): IconSpec | null {
  if (v === null) return null;
  if (typeof v === 'string') return { text: localTextOf(v, where, 8) as string };
  const raw = obj(v);
  const icon: IconSpec = {};
  if (raw.text !== undefined) icon.text = str(raw.text, 8);
  if (raw.image !== undefined) icon.image = filePath(raw.image, `${where} 아이콘`, files);
  const color = str(raw.color, 40);
  if (color && COLOR.test(color)) icon.color = color;
  if (!icon.text && !icon.image) fail(`${where} 아이콘에 text나 image가 있어야 해요.`);
  return icon;
}

function reactionOf(raw: Record<string, unknown>, where: string): Reaction {
  const reaction: Reaction = {};
  const when = parseWhen(raw.when, where);
  if (when) reaction.when = when;
  if (raw.state !== undefined) {
    if (!isThemeState(raw.state)) fail(`${where}의 state ${String(raw.state).slice(0, 40)}은(는) 없는 동작이에요.`);
    reaction.state = raw.state as ThemeState;
  }
  const say = sayOf(raw.say, where);
  if (say) reaction.say = say;
  if (raw.effect !== undefined) {
    if (!(EFFECT_NAMES as readonly unknown[]).includes(raw.effect)) fail(`${where}의 effect는 ${EFFECT_NAMES.join(', ')} 중 하나여야 해요.`);
    reaction.effect = raw.effect as EffectName;
  }
  return reaction;
}

function limited(input: unknown, max: number, label: string): unknown[] {
  const list = Array.isArray(input) ? input : [];
  if (list.length > max) fail(`${label}는 ${max}개까지예요.`);
  return list;
}

function parseEmotes(input: unknown, files: ReadonlySet<string> | null, label = '머리 위 표시'): EmoteRule[] {
  return limited(input, THEME_LIMITS.emotes, label).map((item, i) => {
    const raw = obj(item);
    const where = `${label} ${i + 1}`;
    const rule: EmoteRule = {};
    const when = parseWhen(raw.when, where);
    if (when) rule.when = when;
    if ('icon' in raw) rule.icon = iconOf(raw.icon, where, files);
    const say = sayOf(raw.say, where);
    if (say) rule.say = say;
    const every = num(raw.every, 3, 3600);
    if (every !== null) rule.every = every;
    if (rule.icon === undefined && !rule.say) fail(`${where}에 icon이나 say가 있어야 해요.`);
    return rule;
  });
}

function parseInteractions(input: unknown, label = '교감 메뉴'): Interaction[] {
  const list = limited(input, THEME_LIMITS.interactions, label).map((item, i) => {
    const raw = obj(item);
    const where = `${label} ${i + 1}`;
    const id = str(raw.id, 40);
    if (!SLUG.test(id)) fail(`${where}의 id는 영어 소문자·숫자·하이픈으로 2~40자여야 해요.`);
    const hidden = raw.hidden === true;
    const reactions = limited(raw.reactions, 16, `${where}의 반응`).map((r, j) => reactionOf(obj(r), `${where} 반응 ${j + 1}`));
    if (!hidden && !reactions.length) fail(`${where}에 반응이 하나 이상 있어야 해요.`);
    const when = parseWhen(raw.when, where);
    return { id, label: hidden && raw.label === undefined ? id : localTextOf(raw.label, `${where}의 label`, 30), hidden, reactions, ...(when && { when }) };
  });
  const dup = list.find((x, i) => list.findIndex((o) => o.id === x.id) !== i);
  if (dup) fail(`${label} id ${dup.id}가 겹쳐요.`);
  return list;
}

const PROP_STATE = /^[a-z][a-z0-9_-]{0,19}$/;

function parseProps(input: unknown, files: ReadonlySet<string> | null, label = '소품'): ThemeProp[] {
  const list = limited(input, THEME_LIMITS.props, label).map((item, i) => {
    const raw = obj(item);
    const where = `${label} ${i + 1}`;
    const id = str(raw.id, 40);
    if (!SLUG.test(id)) fail(`${where}의 id는 영어 소문자·숫자·하이픈으로 2~40자여야 해요.`);
    const at = point(raw, where);
    const states: Record<string, string> = {};
    const statesIn = Object.entries(obj(raw.states));
    if (statesIn.length > 8) fail(`${where}의 상태 그림은 8개까지예요.`);
    for (const [name, path] of statesIn) {
      if (!PROP_STATE.test(name)) fail(`${where}의 상태 이름 ${name.slice(0, 20)}이(가) 올바르지 않아요.`);
      states[name] = filePath(path, `${where}의 ${name} 상태`, files);
    }
    const area = areaOf(raw.area);
    const spot = raw.spot === 'door' || (SPOT_NAMES as readonly unknown[]).includes(raw.spot) ? (raw.spot as ThemeProp['spot']) : undefined;
    return { id, image: filePath(raw.image, where, files), x: at.x, y: at.y, front: raw.front === true, states, ...(area && { area }), ...(spot && { spot }) };
  });
  const dup = list.find((x, i) => list.findIndex((o) => o.id === x.id) !== i);
  if (dup) fail(`${label} id ${dup.id}가 겹쳐요.`);
  return list;
}

function parseEvents(input: unknown, label = '이벤트 반응'): EventRule[] {
  return limited(input, THEME_LIMITS.events, label).map((item, i) => {
    const raw = obj(item);
    const where = `${label} ${i + 1}`;
    if (!(THEME_EVENTS as readonly unknown[]).includes(raw.on)) fail(`${where}의 on ${String(raw.on).slice(0, 40)}은(는) 없는 이벤트예요.`);
    const rule: EventRule = { on: raw.on as ThemeEvent, ...reactionOf(raw, where), replace: raw.replace === true };
    if (raw.prop !== undefined) {
      const p = obj(raw.prop);
      const id = str(p.id, 40);
      const state = str(p.state, 20);
      if (!SLUG.test(id) || !PROP_STATE.test(state)) fail(`${where}의 prop은 { "id": 소품 id, "state": 상태 이름 }이어야 해요.`);
      rule.prop = { id, state, ms: num(p.ms, 100, 10000) ?? 1500 };
    }
    return rule;
  });
}

function parseVariants(input: unknown, files: ReadonlySet<string> | null): ThemeVariant[] {
  const list = limited(input, THEME_LIMITS.variants, '시즌 변형').map((item, i) => {
    const raw = obj(item);
    const where = `시즌 변형 ${i + 1}`;
    const id = str(raw.id, 40);
    if (!SLUG.test(id)) fail(`${where}의 id는 영어 소문자·숫자·하이픈으로 2~40자여야 해요.`);
    const when = parseWhen(raw.when, where);
    if (!when || Object.keys(when).some((k) => !['hours', 'weekdays', 'dates'].includes(k))) fail(`${where}의 when에는 dates, weekdays, hours만 쓸 수 있어요.`);
    const variant: ThemeVariant = { id, name: str(raw.name, 60) || id, when: when! };
    if (raw.layers !== undefined) {
      variant.layers = parseLayers(raw.layers, `${where} 배경 레이어`, files);
      if (!variant.layers.length) fail(`${where}의 layers가 비어 있어요.`);
    }
    if (raw.addLayers !== undefined) variant.addLayers = parseLayers(raw.addLayers, `${where} 추가 레이어`, files);
    if (raw.props !== undefined) variant.props = parseProps(raw.props, files, `${where} 소품`);
    if (raw.characters !== undefined) {
      variant.characters = limited(raw.characters, THEME_LIMITS.characters, `${where} 캐릭터`).map((c, j) => parseCharacter(c, j, files));
    }
    if (raw.accessories !== undefined) variant.accessories = parseAccessories(raw.accessories, files);
    if (raw.wear !== undefined) variant.wear = limited(raw.wear, 8, `${where}의 wear`).map((l, j) => accessoryLayer(l, `${where} wear ${j + 1}`, files));
    if (raw.emotes !== undefined) variant.emotes = parseEmotes(raw.emotes, files, `${where} 머리 위 표시`);
    if (raw.interactions !== undefined) variant.interactions = parseInteractions(raw.interactions, `${where} 교감 메뉴`);
    if (raw.events !== undefined) variant.events = parseEvents(raw.events, `${where} 이벤트 반응`);
    if (raw.tokens !== undefined) variant.tokens = parseTokens(raw.tokens);
    if (raw.site !== undefined) variant.site = parseSite(raw.site, files);
    return variant;
  });
  const dup = list.find((x, i) => list.findIndex((o) => o.id === x.id) !== i);
  if (dup) fail(`시즌 변형 id ${dup.id}가 겹쳐요.`);
  return list;
}

function parseTokens(input: unknown): Partial<Record<TokenName, string>> {
  const tokensIn = obj(input);
  const tokens: Partial<Record<TokenName, string>> = {};
  for (const name of TOKEN_NAMES) {
    const value = str(tokensIn[name], 60);
    if (!value) continue;
    if (!COLOR.test(value)) fail(`색 토큰 ${name}의 값은 #hex, rgb(), hsl() 색이어야 해요.`);
    tokens[name] = value;
  }
  return tokens;
}

function parseSite(input: unknown, files: ReadonlySet<string> | null): SiteLook {
  const raw = obj(input);
  const site: SiteLook = {};
  if (raw.font !== undefined) {
    if ((SITE_FONTS as readonly unknown[]).includes(raw.font)) site.font = raw.font as SiteFont;
    else {
      const file = filePath(obj(raw.font).file, '사이트 글꼴', files, false);
      if (!file.endsWith('.woff2')) fail('사이트 글꼴 파일은 .woff2여야 해요.');
      site.font = { file };
    }
  }
  if (raw.radius !== undefined) site.radius = num(raw.radius, 0, 20) ?? fail('사이트 모서리 둥글기(radius)는 0~20 사이 숫자여야 해요.');
  if (raw.background !== undefined) {
    const bg = obj(raw.background);
    site.background = { image: filePath(bg.image, '사이트 배경', files), repeat: bg.repeat === true };
  }
  return site;
}

const byId = <T extends { id: string }>(base: readonly T[], over: readonly T[] | undefined) =>
  over ? [...base.map((x) => over.find((o) => o.id === x.id) ?? x), ...over.filter((o) => !base.some((x) => x.id === o.id))] : [...base];

/** The theme as it looks under `variant`: the variant's parts replace or come before the theme's own. */
export function applyVariant(theme: ThemeManifest, variant: ThemeVariant | undefined): ThemeManifest {
  if (!variant) return theme;
  return {
    ...theme,
    scene: { ...theme.scene, layers: [...(variant.layers ?? theme.scene.layers), ...(variant.addLayers ?? [])] },
    props: byId(theme.props, variant.props),
    characters: byId(theme.characters, variant.characters),
    accessories: { ...theme.accessories, ...variant.accessories },
    emotes: [...(variant.emotes ?? []), ...theme.emotes],
    interactions: byId(theme.interactions, variant.interactions),
    events: [...(variant.events ?? []), ...theme.events],
    tokens: { ...theme.tokens, ...variant.tokens },
    site: { ...theme.site, ...variant.site },
    ...(variant.wear && { wear: variant.wear }),
  };
}

/**
 * The layers a model of `tier` from `companyId` wears, or null when the theme leaves that company to the pixel hat.
 * Once a theme has a set for the company (or `*`), lower tiers without layers wear nothing rather than a pixel hat.
 */
export function accessoriesFor(accessories: Accessories, companyId: string, tier: number): AccessoryLayer[] | null {
  const set = accessories[companyId] ?? accessories['*'];
  if (!set) return null;
  return ACCESSORY_TIERS.filter((t) => Number(t) <= tier).flatMap((t) => set[t] ?? []);
}

/** The dated variant showing at `now`: the first whose time conditions hold. */
export const activeVariant = (theme: ThemeManifest, now: Date): ThemeVariant | undefined =>
  theme.variants.find((v) => matches(v.when, { now }));

/** Every file a manifest refers to, its variants included. */
export function manifestFiles(theme: ThemeManifest): string[] {
  const layers = (list: SceneLayer[] = []) => list.map((l) => l.image);
  const characters = (list: ThemeCharacter[] = []) => list.flatMap((c) => [c.sheet, ...Object.values(c.portraits)]);
  const accessories = (set: Accessories = {}) => Object.values(set).flatMap((tiers) => Object.values(tiers).flatMap((list) => list.map((l) => l.image)));
  const props = (list: ThemeProp[] = []) => list.flatMap((p) => [p.image, ...Object.values(p.states)]);
  const icons = (list: EmoteRule[] = []) => list.flatMap((e) => (e.icon?.image ? [e.icon.image] : []));
  const site = (look: SiteLook = {}) => [
    ...(look.background ? [look.background.image] : []),
    ...(typeof look.font === 'object' ? [look.font.file] : []),
  ];
  return [
    theme.preview,
    ...site(theme.site),
    ...layers(theme.scene.layers),
    ...characters(theme.characters),
    ...accessories(theme.accessories),
    ...props(theme.props),
    ...icons(theme.emotes),
    ...theme.variants.flatMap((v) => [
      ...layers(v.layers),
      ...layers(v.addLayers),
      ...props(v.props),
      ...characters(v.characters),
      ...accessories(v.accessories),
      ...(v.wear ?? []).map((l) => l.image),
      ...icons(v.emotes),
      ...site(v.site),
    ]),
    ...(theme.css ? [theme.css] : []),
  ];
}

/**
 * Validates an untrusted theme.json. Pass the package's file list to also check that every referenced file exists.
 * Throws with a Korean message meant for the person importing the theme.
 */
export function parseThemeManifest(input: unknown, files: ReadonlySet<string> | null = null): ThemeManifest {
  const raw = obj(input);
  if (raw.format !== THEME_FORMAT) fail('테마 패키지가 아니에요.');
  if (raw.version !== 1) fail('이 버전의 테마는 아직 읽을 수 없어요.');
  const id = str(raw.id, 40);
  if (!SLUG.test(id)) fail('id는 영어 소문자·숫자·하이픈으로 2~40자여야 해요.');
  if ((BUILTIN_THEMES as readonly string[]).includes(id)) fail(`'${id}'은(는) 앱에 들어 있는 테마 이름이라 쓸 수 없어요.`);
  const themeVersion = str(raw.themeVersion, 20);
  if (!SEMVER.test(themeVersion)) fail('themeVersion은 1.0.0 같은 형식이어야 해요.');
  const license = str(raw.license, 80);
  if (!license) fail('라이선스(license)를 적어 주세요.');

  const charactersIn = Array.isArray(raw.characters) ? raw.characters : [];
  if (!charactersIn.length) fail('캐릭터가 하나 이상 있어야 해요.');
  if (charactersIn.length > THEME_LIMITS.characters) fail(`캐릭터는 ${THEME_LIMITS.characters}명까지예요.`);
  const characters = charactersIn.map((c, i) => parseCharacter(c, i, files));
  const dup = characters.find((c, i) => characters.findIndex((o) => o.id === c.id) !== i);
  if (dup) fail(`캐릭터 id ${dup.id}가 겹쳐요.`);

  const tokens = parseTokens(raw.tokens);

  const css = raw.css === undefined || raw.css === null ? null : str(raw.css, 200);
  if (css !== null && (!isSafePath(css) || !css.endsWith('.css'))) fail('css 경로가 올바르지 않아요.');
  if (css !== null && files && !files.has(css)) fail(`css 파일 ${css}이(가) 패키지에 없어요.`);

  return {
    format: THEME_FORMAT,
    version: 1,
    id,
    themeVersion,
    name: str(raw.name, 60) || id,
    author: str(raw.author, 60),
    license,
    description: str(raw.description, 500),
    preview: filePath(raw.preview, '미리보기', files),
    scene: parseScene(raw.scene, files),
    characters,
    tokens,
    site: parseSite(raw.site, files),
    css,
    accessories: parseAccessories(raw.accessories, files),
    emotes: parseEmotes(raw.emotes, files),
    interactions: parseInteractions(raw.interactions),
    props: parseProps(raw.props, files),
    events: parseEvents(raw.events),
    variants: parseVariants(raw.variants, files),
  };
}

/** What the app lists about an installed theme. */
export interface ThemeSummary {
  id: string;
  themeVersion: string;
  name: string;
  author: string;
  license: string;
  description: string;
  preview: string;
  hasCss: boolean;
  characters: { id: string; name: string }[];
}

export const themeSummary = (theme: ThemeManifest): ThemeSummary => ({
  id: theme.id,
  themeVersion: theme.themeVersion,
  name: theme.name,
  author: theme.author,
  license: theme.license,
  description: theme.description,
  preview: theme.preview,
  hasCss: theme.css !== null,
  characters: theme.characters.map((c) => ({ id: c.id, name: c.name })),
});

/** A company theme booked for a season, as an inclusive `MM-DD` range that may wrap past new year. */
export interface ThemeBooking {
  theme: string;
  from: string;
  to: string;
}

export const THEME_BOOKINGS_MAX = 12;

export function parseBookings(input: unknown): ThemeBooking[] {
  const bad = (message: string): never => {
    throw new Error(message);
  };
  const list = Array.isArray(input) ? input : [];
  if (list.length > THEME_BOOKINGS_MAX) bad(`기간별 테마는 ${THEME_BOOKINGS_MAX}개까지예요.`);
  return list.map((item, i) => {
    const raw = obj(item);
    const theme = str(raw.theme, 40);
    if (!SLUG.test(theme) && theme !== DEFAULT_THEME) bad(`기간별 테마 ${i + 1}의 테마가 올바르지 않아요.`);
    if (!isMonthDay(raw.from) || !isMonthDay(raw.to)) bad(`기간별 테마 ${i + 1}의 날짜는 MM-DD 형식이어야 해요.`);
    return { theme, from: raw.from as string, to: raw.to as string };
  });
}

/** The company theme on `now`: the first booking whose dates hold, otherwise the everyday one. */
export const companyThemeOn = (theme: string | undefined, bookings: readonly ThemeBooking[] | undefined, now: Date): string =>
  bookings?.find((b) => inDates([b.from, b.to], now))?.theme ?? theme ?? DEFAULT_THEME;

/** The theme an office shows: its own pick if it has one, otherwise the company theme every office shares, as booked for today. */
export const officeTheme = (
  office: { theme?: string },
  companyTheme: string | undefined,
  bookings?: readonly ThemeBooking[],
  now: Date = new Date(),
): string => office.theme ?? companyThemeOn(companyTheme, bookings, now);

/** Themes used to be picked per office: the one most offices used becomes the company theme, and those offices follow it. */
export function adoptCompanyTheme(offices: { theme?: string }[]): string {
  const counts = new Map<string, number>();
  for (const office of offices) if (office.theme) counts.set(office.theme, (counts.get(office.theme) ?? 0) + 1);
  const theme = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? DEFAULT_THEME;
  for (const office of offices) if (office.theme === theme) delete office.theme;
  return theme;
}

/** The character an agent appears as: the one they picked from this theme, otherwise one by role. */
export function characterFor(theme: ThemeManifest, skin: string, role: Role): ThemeCharacter {
  const own = splitPackSkin(skin);
  const picked = own?.themeId === theme.id ? theme.characters.find((c) => c.id === own.characterId) : undefined;
  return picked ?? theme.characters[ROLES.indexOf(role) % theme.characters.length];
}

/** The portrait for an expression, falling back along the same chain as states (thanks → smile → …), then `normal`. */
export function portraitFor(character: ThemeCharacter, expression: Expression): string | null {
  let state: string | null = expression;
  while (state) {
    const path = character.portraits[state as Expression];
    if (path) return path;
    state = isThemeState(state) ? STATE_FALLBACK[state] : null;
  }
  return character.portraits.normal ?? null;
}

/** How agents point at a theme character: `<themeId>:<characterId>`. Built-in skins have no colon. */
export const packSkin = (themeId: string, characterId: string): `${string}:${string}` => `${themeId}:${characterId}`;

export function splitPackSkin(skin: string): { themeId: string; characterId: string } | null {
  const [themeId, characterId, ...rest] = skin.split(':');
  return rest.length || !characterId || !SLUG.test(themeId) || !SLUG.test(characterId) ? null : { themeId, characterId };
}
