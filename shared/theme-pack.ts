import { TEAMS } from './teams.ts';
import type { Expression, Role, TeamId } from './types.ts';

/**
 * A shareable look for an office: a background scene and characters with a default and per-event states.
 * Packages are untrusted (anyone can make one), so everything here validates and drops unknown fields.
 * No dependencies beyond shared/, so the community service can reuse the same checks.
 */
export const THEME_FORMAT = 'avataragent-theme';
export const BUILTIN_THEME = 'pixel';

export const THEME_LIMITS = {
  zipBytes: 20 * 1024 * 1024,
  files: 300,
  imagePx: 4096,
  cssBytes: 64 * 1024,
  framesPerState: 32,
  characters: 16,
  layers: 32,
} as const;

export const THEME_FILE_EXTS = ['png', 'webp', 'json', 'css', 'txt'] as const;

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

export interface SceneLayer extends Point {
  image: string;
  /** In front of characters (plants, desk fronts) instead of behind them. */
  front: boolean;
}

export interface ThemeScene {
  layers: SceneLayer[];
  seats: Partial<Record<Role, Point>>;
  door: Point | null;
  lounge: Point | null;
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
  scale: number;
  states: Partial<Record<ThemeState, StateClip>> & { idle: StateClip };
  portraits: Partial<Record<Expression, string>>;
}

export const TOKEN_NAMES = ['ink', 'paper', 'bg', 'line', 'accent', 'primary', 'green', 'red', 'blue', 'yellow', 'muted'] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];

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
  css: string | null;
}

/**
 * Every state a character may define, each pointing to the one used when it is missing.
 * Chains always end at `idle`, so a theme with a single idle frame already works everywhere.
 */
export const STATE_FALLBACK = {
  idle: null,
  walk: 'idle',
  sit: 'idle',
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

function parseScene(input: unknown, files: ReadonlySet<string> | null): ThemeScene {
  const raw = obj(input);
  const layersIn = Array.isArray(raw.layers) ? raw.layers : [];
  if (!layersIn.length) fail('배경 레이어가 하나 이상 있어야 해요.');
  if (layersIn.length > THEME_LIMITS.layers) fail(`배경 레이어는 ${THEME_LIMITS.layers}개까지예요.`);
  const layers = layersIn.map((item, i) => {
    const l = obj(item);
    const at = point(l, `배경 레이어 ${i + 1}`, THEME_SCENE.w, THEME_SCENE.h);
    return { image: filePath(l.image, `배경 레이어 ${i + 1}`, files), x: at.x, y: at.y, front: l.front === true };
  });
  const seatsIn = obj(raw.seats);
  const seats: ThemeScene['seats'] = {};
  for (const role of ROLES) if (role in seatsIn) seats[role] = point(seatsIn[role], `${role} 좌석`);
  const tintIn = obj(raw.teamTint);
  const teamTint: ThemeScene['teamTint'] = {};
  for (const team of Object.keys(TEAMS) as TeamId[]) {
    const color = str(tintIn[team], 40);
    if (color && COLOR.test(color)) teamTint[team] = color;
  }
  return {
    layers,
    seats,
    door: raw.door === undefined || raw.door === null ? null : point(raw.door, '문'),
    lounge: raw.lounge === undefined || raw.lounge === null ? null : point(raw.lounge, '라운지'),
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
  return {
    id,
    name: str(raw.name, 40) || id,
    sheet: filePath(raw.sheet, `${where}의 스프라이트 시트`, files),
    frames,
    anchor: { x: num(anchor.x, 0, 1) ?? 0.5, y: num(anchor.y, 0, 1) ?? 1 },
    scale: num(raw.scale, 0.05, 16) ?? 1,
    states: states as ThemeCharacter['states'],
    portraits,
  };
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
  if (id === BUILTIN_THEME) fail(`'${BUILTIN_THEME}'은(는) 기본 테마 이름이라 쓸 수 없어요.`);
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

  const tokensIn = obj(raw.tokens);
  const tokens: ThemeManifest['tokens'] = {};
  for (const name of TOKEN_NAMES) {
    const value = str(tokensIn[name], 60);
    if (!value) continue;
    if (!COLOR.test(value)) fail(`색 토큰 ${name}의 값은 #hex, rgb(), hsl() 색이어야 해요.`);
    tokens[name] = value;
  }

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
    css,
  };
}

/** How agents point at a theme character: `<themeId>:<characterId>`. Built-in skins have no colon. */
export const packSkin = (themeId: string, characterId: string) => `${themeId}:${characterId}`;

export function splitPackSkin(skin: string): { themeId: string; characterId: string } | null {
  const [themeId, characterId, ...rest] = skin.split(':');
  return rest.length || !characterId || !SLUG.test(themeId) || !SLUG.test(characterId) ? null : { themeId, characterId };
}
