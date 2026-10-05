import { zipSync } from 'fflate';
import {
  parseThemeManifest,
  THEME_FORMAT,
  THEME_SCENE,
  type AreaName,
  type Point,
  type Rect,
  type SpotName,
  type StateClip,
  type ThemeManifest,
  type ThemeState,
  type SiteFont,
  type TokenName,
} from '../../../shared/theme-pack.ts';
import type { Role } from '../../../shared/types.ts';

/**
 * What the theme studio edits, turned into a theme package. Kept free of DOM and pixi so it can be tested,
 * and validated with the same parser the server uses, so the studio shows the server's errors before upload.
 */

export interface StudioImage {
  /** Path inside the package, such as assets/room.png. */
  path: string;
  bytes: Uint8Array;
  w: number;
  h: number;
}

export interface StudioLayer {
  image: StudioImage;
  x: number;
  y: number;
  front: boolean;
  /** The background of one space; the space's area is where this picture lies. */
  area?: AreaName;
}

export interface StudioCharacter {
  id: string;
  name: string;
  sheet: StudioImage;
  /** Sheets are cut into a grid of equal frames, named f0, f1… left to right, top to bottom. */
  frameW: number;
  frameH: number;
  scale: number;
  anchor: Point;
  head: Point;
  states: Partial<Record<ThemeState, StateClip>>;
}

export interface StudioDraft {
  id: string;
  name: string;
  author: string;
  license: string;
  description: string;
  themeVersion: string;
  scaleMode: 'nearest' | 'linear';
  layers: StudioLayer[];
  characters: StudioCharacter[];
  seats: Partial<Record<Role, Point>>;
  lounge: Partial<Record<Role, Point>>;
  door: Point | null;
  spots: Partial<Record<SpotName, Rect>>;
  tokens: Partial<Record<TokenName, string>>;
  font: SiteFont;
  radius: number;
  css: string;
}

export const PREVIEW_PATH = 'preview.png';
export const CSS_PATH = 'theme.css';

export const emptyDraft = (): StudioDraft => ({
  id: '',
  name: '',
  author: '',
  license: 'CC-BY-4.0',
  description: '',
  themeVersion: '1.0.0',
  scaleMode: 'linear',
  layers: [],
  characters: [],
  seats: {},
  lounge: {},
  door: null,
  spots: {},
  tokens: {},
  font: 'default',
  radius: 0,
  css: '',
});

export function gridSize(character: Pick<StudioCharacter, 'sheet' | 'frameW' | 'frameH'>) {
  const cols = character.frameW > 0 ? Math.floor(character.sheet.w / character.frameW) : 0;
  const rows = character.frameH > 0 ? Math.floor(character.sheet.h / character.frameH) : 0;
  return { cols, rows };
}

export function gridFrames(character: StudioCharacter): Record<string, Rect> {
  const { cols, rows } = gridSize(character);
  const frames: Record<string, Rect> = {};
  for (let i = 0; i < cols * rows; i++) {
    frames[`f${i}`] = { x: (i % cols) * character.frameW, y: Math.floor(i / cols) * character.frameH, w: character.frameW, h: character.frameH };
  }
  return frames;
}

/** A package path for an uploaded file name that does not clash with `taken`. */
export function assetPath(fileName: string, taken: Iterable<string>, ext: 'png' | 'webp' = 'png') {
  const used = new Set(taken);
  const base =
    fileName
      .replace(/\.[^.]*$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'image';
  let path = `assets/${base}.${ext}`;
  for (let n = 2; used.has(path); n++) path = `assets/${base}-${n}.${ext}`;
  return path;
}

/** Each space covers the first background picture marked for it, clipped to the scene. */
function areasOf(layers: StudioLayer[]) {
  const areas: Partial<Record<AreaName, Rect>> = {};
  for (const l of layers) {
    if (!l.area || l.front || areas[l.area]) continue;
    const x = Math.max(0, Math.round(l.x));
    const y = Math.max(0, Math.round(l.y));
    const w = Math.min(Math.round(l.x) + l.image.w, THEME_SCENE.w) - x;
    const h = Math.min(Math.round(l.y) + l.image.h, THEME_SCENE.h) - y;
    if (w >= 1 && h >= 1 && x < THEME_SCENE.w && y < THEME_SCENE.h) areas[l.area] = { x, y, w, h };
  }
  return areas;
}

function draftManifest(draft: StudioDraft) {
  return {
    format: THEME_FORMAT,
    version: 1,
    id: draft.id.trim(),
    themeVersion: draft.themeVersion.trim(),
    name: draft.name.trim(),
    author: draft.author.trim(),
    license: draft.license.trim(),
    description: draft.description.trim(),
    preview: PREVIEW_PATH,
    scene: {
      layers: draft.layers.map((l) => ({ image: l.image.path, x: Math.round(l.x), y: Math.round(l.y), front: l.front, ...(l.area && { area: l.area }) })),
      seats: draft.seats,
      lounge: draft.lounge,
      door: draft.door,
      spots: draft.spots,
      areas: areasOf(draft.layers),
      scaleMode: draft.scaleMode,
    },
    characters: draft.characters.map((c) => ({
      id: c.id.trim(),
      name: c.name.trim(),
      sheet: c.sheet.path,
      frames: gridFrames(c),
      anchor: c.anchor,
      head: c.head,
      scale: c.scale,
      states: c.states,
    })),
    tokens: draft.tokens,
    site: { ...(draft.font !== 'default' && { font: draft.font }), ...(draft.radius > 0 && { radius: draft.radius }) },
    css: draft.css.trim() ? CSS_PATH : null,
  };
}

function draftFiles(draft: StudioDraft) {
  const files = new Map<string, Uint8Array>();
  for (const l of draft.layers) files.set(l.image.path, l.image.bytes);
  for (const c of draft.characters) files.set(c.sheet.path, c.sheet.bytes);
  if (draft.css.trim()) files.set(CSS_PATH, new TextEncoder().encode(draft.css));
  return files;
}

/** The manifest the draft would produce, or the first problem a person must fix, in the server's words. */
export function checkDraft(draft: StudioDraft): { manifest: ThemeManifest; error: null } | { manifest: null; error: string } {
  try {
    const names = new Set([...draftFiles(draft).keys(), PREVIEW_PATH]);
    return { manifest: parseThemeManifest(draftManifest(draft), names), error: null };
  } catch (error) {
    return { manifest: null, error: (error instanceof Error ? error.message : String(error)).replace(/^테마 파일 오류: /, '') };
  }
}

const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;

/**
 * A manifest good enough to draw while the draft is unfinished: missing names get placeholders and characters
 * without an idle frame are left out. Null until there is at least one background layer and one character.
 */
export function previewManifest(draft: StudioDraft): ThemeManifest | null {
  const characters = draft.characters
    .map((c, i) => ({ ...c, id: SLUG.test(c.id) ? c.id : `c${i}-preview` }))
    .filter((c) => c.states.idle?.frames.length && c.frameW > 0 && c.frameH > 0);
  const filled: StudioDraft = {
    ...draft,
    id: 'studio-preview',
    name: draft.name || 'preview',
    license: draft.license || 'preview',
    themeVersion: '0.0.0',
    characters,
    tokens: {},
    css: '',
  };
  if (!filled.layers.length || !characters.length) return null;
  try {
    return parseThemeManifest(draftManifest(filled));
  } catch {
    return null;
  }
}

/** The package as a zip; `preview` is a PNG of the scene, taken by the studio. */
export function buildPackage(draft: StudioDraft, preview: Uint8Array): Uint8Array {
  const checked = checkDraft(draft);
  if (!checked.manifest) throw new Error(checked.error);
  const files: Record<string, Uint8Array> = Object.fromEntries(draftFiles(draft));
  files[PREVIEW_PATH] = preview;
  files['theme.json'] = new TextEncoder().encode(JSON.stringify(checked.manifest, null, 2));
  return zipSync(files);
}
