import type { Container, Texture } from 'pixi.js';
import type { TeamMeta } from '../../../shared/teams.ts';
import {
  DEFAULT_THEME,
  SPOT_NAMES,
  type EmoteRule,
  type DressRule,
  type EventRule,
  type Interaction,
  type Point,
  type Rect,
  type SceneLayout,
  type SpotName,
  type ThemeState,
} from '../../../shared/theme-pack.ts';
import type { Agent, Role } from '../../../shared/types.ts';

/** A layout with every gap filled in. Seats are where a character's feet stand. */
export interface Layout {
  seats: Record<Role, Point>;
  lounge: Record<Role, Point>;
  extraSeats: Point[];
  extraLounge: Point[];
  door: Point;
  spots: Record<SpotName, Rect>;
  /** Passed on the way between desk and lounge; null when the two spaces are side by side and people walk straight. */
  passage: Point | null;
  waypoints: Record<string, Point>;
  links: [string, string][];
  walkSpeed: number;
}

export const DEFAULT_LAYOUT: Layout = {
  seats: {
    manager: { x: 400, y: 194 },
    researcher: { x: 180, y: 304 },
    writer: { x: 400, y: 399 },
    reviewer: { x: 620, y: 304 },
  },
  lounge: {
    manager: { x: 862, y: 342 },
    researcher: { x: 942, y: 342 },
    writer: { x: 940, y: 162 },
    reviewer: { x: 864, y: 162 },
  },
  extraSeats: [
    { x: 180, y: 194 },
    { x: 620, y: 194 },
    { x: 180, y: 399 },
    { x: 620, y: 399 },
  ],
  extraLounge: [
    { x: 842, y: 252 },
    { x: 962, y: 252 },
    { x: 846, y: 446 },
    { x: 958, y: 446 },
  ],
  door: { x: 805, y: 248 },
  spots: {
    board: { x: 260, y: 14, w: 280, h: 86 },
    shelf: { x: 690, y: 22, w: 80, h: 92 },
    safe: { x: 700, y: 392, w: 70, h: 62 },
    archive: { x: 30, y: 404, w: 64, h: 44 },
  },
  // The built-in office has a corridor between the spaces, with the door in it.
  passage: { x: 805, y: 248 },
  waypoints: {},
  links: [],
  walkSpeed: 170,
};

/** The scene is 480 tall and a name tag hangs about 26px under the feet: lower spots would cut it off. */
export const FEET_MAX_Y = 480 - 28;
const onStage = (p: Point): Point => (p.y > FEET_MAX_Y ? { ...p, y: FEET_MAX_Y } : p);
const onStageAll = <K extends string>(points: Record<K, Point>) =>
  Object.fromEntries(Object.entries(points).map(([k, p]) => [k, onStage(p as Point)])) as Record<K, Point>;

export function mergeLayout(from: Partial<SceneLayout>): Layout {
  const extraSeats = (from.extraSeats?.length ? from.extraSeats : DEFAULT_LAYOUT.extraSeats).map(onStage);
  return {
    seats: onStageAll({ ...DEFAULT_LAYOUT.seats, ...from.seats }),
    lounge: onStageAll({ ...DEFAULT_LAYOUT.lounge, ...from.lounge }),
    extraSeats,
    // Pair every extra seat with a resting spot, reusing the defaults when a theme gives fewer.
    extraLounge: extraSeats.map((_, i) => onStage(from.extraLounge?.[i] ?? DEFAULT_LAYOUT.extraLounge[i % DEFAULT_LAYOUT.extraLounge.length])),
    door: from.door ?? DEFAULT_LAYOUT.door,
    // Paths of their own replace the corridor; so does a lounge beside the work space.
    passage: Object.keys(from.waypoints ?? {}).length || (from.areas?.work && from.areas.lounge) ? null : (from.door ?? DEFAULT_LAYOUT.door),
    waypoints: onStageAll(from.waypoints ?? {}),
    links: from.links ?? [],
    walkSpeed: from.walkSpeed ?? DEFAULT_LAYOUT.walkSpeed,
    spots: Object.fromEntries(SPOT_NAMES.map((name) => [name, from.spots?.[name] ?? DEFAULT_LAYOUT.spots[name]])) as Layout['spots'],
  };
}

/** What a character is doing right now; the theme decides how that looks. */
export interface CharacterLook {
  walking: boolean;
  /** Facing away from the viewer: walking up the room, or standing at something on the wall. */
  back?: boolean;
  place: 'desk' | 'lounge';
  status: Agent['status'];
  expression: Agent['expression'];
  /** A short moment from an office event, such as a rejected review. */
  moment: ThemeState | null;
  /** Outfits the theme's dress rules call for now, first match first; themes without outfits ignore them. */
  dress?: readonly string[];
}

export interface CharacterArt {
  view: Container;
  /** The theme character shown, for rules about a character. */
  characterId?: string;
  /** Height above the feet where the role tag sits (negative y); status icons float above it. */
  tagY: number;
  /** Clickable box around the feet: half width and height. */
  hit: { halfW: number; h: number };
  apply(agent: Agent): void;
  /** `phase` is seconds since the character appeared. */
  update(phase: number, look: CharacterLook): void;
}

export interface RoomArt {
  /** Floor, walls and furniture behind everyone. */
  back: Container;
  /** Desk fronts and anything that covers characters. */
  front: Container;
  /** One per extra seat, shown only while that seat is taken. */
  extraDesks: Container[];
  /** Furniture drawn on its own, by prop id. */
  props?: Map<string, PropArt>;
}

export interface PropArt {
  spot?: string;
  has(state: string): boolean;
  /** Shows the picture for `state`, or the usual one with null. */
  setState(state: string | null): void;
}

export interface OfficeTheme {
  id: string;
  layout: Layout;
  background(team: TeamMeta): string;
  buildRoom(team: TeamMeta): RoomArt;
  createCharacter(): CharacterArt;
  /** The theme's own rules, read before the app's. */
  emotes?: EmoteRule[];
  interactions?: Interaction[];
  events?: EventRule[];
  dress?: DressRule[];
  /** A loaded picture from the package, for icon images. */
  texture?(path: string): Texture | undefined;
  /** The dated variant showing; the office reloads once `variantAt` says another one is due. */
  variant?: string | null;
  variantAt?(now: Date): string | null;
}

/** Installed theme packages are served here as `<id>/theme.json` plus their files. */
export const THEME_BASE = '/themes';

/** Loads a theme by id; anything that fails to load falls back to the pixel theme so the office always shows. */
export async function loadTheme(id: string = DEFAULT_THEME): Promise<OfficeTheme> {
  const { createPixelTheme } = await import('./themes/pixel.ts');
  if (id === DEFAULT_THEME) return createPixelTheme();
  try {
    const { loadPackTheme } = await import('./themes/pack.ts');
    return await loadPackTheme(id, `${THEME_BASE}/${encodeURIComponent(id)}`);
  } catch (error) {
    console.warn(`theme ${id} failed to load, using pixel`, error);
    return createPixelTheme();
  }
}
