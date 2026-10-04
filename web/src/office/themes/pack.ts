import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { companyOf, modelOf } from '../../../../shared/models.ts';
import {
  isThemeState,
  parseThemeManifest,
  resolveState,
  splitPackSkin,
  type ThemeCharacter,
  type ThemeManifest,
  type ThemeState,
} from '../../../../shared/theme-pack.ts';
import type { Agent, Role } from '../../../../shared/types.ts';
import { drawHat, drawHatGlow, HAT_TOP, S } from '../pixelArt.ts';
import { mergeLayout, type CharacterArt, type CharacterLook, type OfficeTheme, type RoomArt } from '../theme.ts';

/** A theme built from an installed package: picture layers for the room, sprite sheets for people. */

const ROLES: Role[] = ['manager', 'researcher', 'writer', 'reviewer'];
/** Statuses that should show even over a happy face. */
const URGENT = new Set<string>(['help_requested', 'error', 'paused', 'awaiting_approval']);

/** The state a character wants to show; the package may not have it, so resolveState picks what it does have. */
export function wantedState(look: CharacterLook): ThemeState {
  if (look.moment) return look.moment;
  if (look.walking) return 'walk';
  if (URGENT.has(look.status) && isThemeState(look.status)) return look.status;
  if (look.expression !== 'normal' && isThemeState(look.expression)) return look.expression;
  if (isThemeState(look.status) && look.status !== 'idle') return look.status;
  return look.place === 'desk' ? 'sit' : 'idle';
}

type Frames = Map<string, Texture>;

class PackCharacter implements CharacterArt {
  view = new Container();
  tagY = 0;
  hit = { halfW: 30, h: 100 };
  private sprite = new Sprite();
  private hat = new Graphics();
  private glow = new Graphics();
  private character: ThemeCharacter | null = null;
  private frames: Frames | null = null;
  private state: ThemeState | null = null;
  private stateStart = 0;
  private headY = 0;

  constructor(private theme: ThemeManifest, private sheets: Map<string, Frames>) {
    this.view.addChild(this.glow, this.sprite, this.hat);
  }

  apply(agent: Agent) {
    const own = splitPackSkin(agent.skin);
    const character =
      (own?.themeId === this.theme.id && this.theme.characters.find((c) => c.id === own.characterId)) ||
      this.theme.characters[ROLES.indexOf(agent.role) % this.theme.characters.length];
    if (character !== this.character) {
      this.character = character;
      this.frames = this.sheets.get(character.id)!;
      this.sprite.anchor.set(character.anchor.x, character.anchor.y);
      this.sprite.scale.set(character.scale);
      this.state = null;
      const idle = character.frames[character.states.idle.frames[0]];
      const { scale, anchor, head } = character;
      this.headY = (head.y - anchor.y) * idle.h * scale;
      this.hat.x = this.glow.x = (head.x - anchor.x) * idle.w * scale;
      this.hit = { halfW: (idle.w * scale) / 2, h: anchor.y * idle.h * scale };
    }
    // Until packages bring their own accessories, the model's hat sits on the character's head.
    const model = modelOf(agent.model);
    const company = companyOf(model.vendor);
    drawHat(this.hat, company.hat, company.color, model.tier);
    if (model.tier === 3) drawHatGlow(this.glow, company.hat);
    else this.glow.clear();
    // Pixel hats are drawn for a head whose top is at y = -22·S; their brim covers the top 1·S of it.
    this.hat.y = this.glow.y = this.headY + 23 * S;
    this.tagY = this.hat.y + (HAT_TOP[company.hat] - (model.tier === 3 ? 9 : 6)) * S;
  }

  update(phase: number, look: CharacterLook) {
    if (!this.character || !this.frames) return;
    const state = resolveState(this.character.states, wantedState(look));
    if (state !== this.state) {
      this.state = state;
      this.stateStart = phase;
    }
    const clip = this.character.states[state]!;
    const step = Math.floor((phase - this.stateStart) * clip.fps);
    const index = clip.loop ? step % clip.frames.length : Math.min(step, clip.frames.length - 1);
    this.sprite.texture = this.frames.get(clip.frames[index])!;
    if (this.glow.visible) this.glow.alpha = 0.55 + Math.sin(phase * 3) * 0.35;
  }
}

export async function loadPackTheme(id: string, base: string): Promise<OfficeTheme> {
  const response = await fetch(`${base}/theme.json`);
  if (!response.ok) throw new Error(`theme.json ${response.status}`);
  const theme = parseThemeManifest(await response.json());
  if (theme.id !== id) throw new Error(`theme id mismatch: ${theme.id}`);
  const url = (path: string) => `${base}/${path.split('/').map(encodeURIComponent).join('/')}`;
  return createPackTheme(theme, (path) => Assets.load<Texture>(url(path)));
}

/** Gets the texture for a package file; installed themes load by URL, the theme studio from images in memory. */
export type TextureLoader = (path: string) => Promise<Texture>;

export async function createPackTheme(theme: ThemeManifest, loadTexture: TextureLoader): Promise<OfficeTheme> {
  const images = [...new Set([...theme.scene.layers.map((l) => l.image), ...theme.characters.map((c) => c.sheet)])];
  const loaded = new Map<string, Texture>();
  await Promise.all(
    images.map(async (path) => {
      const texture = await loadTexture(path);
      texture.source.scaleMode = theme.scene.scaleMode;
      loaded.set(path, texture);
    }),
  );

  const sheets = new Map<string, Frames>();
  for (const character of theme.characters) {
    const source = loaded.get(character.sheet)!.source;
    const frames: Frames = new Map();
    for (const [name, f] of Object.entries(character.frames)) frames.set(name, new Texture({ source, frame: new Rectangle(f.x, f.y, f.w, f.h) }));
    sheets.set(character.id, frames);
  }

  return {
    id: theme.id,
    layout: mergeLayout(theme.scene),
    background: (team) => team.wall,
    buildRoom(team): RoomArt {
      const back = new Container();
      const front = new Container();
      theme.scene.layers.forEach((layer, i) => {
        const sprite = new Sprite(loaded.get(layer.image)!);
        sprite.position.set(layer.x, layer.y);
        const tint = theme.scene.teamTint[team.id];
        if (i === 0 && tint) sprite.tint = tint;
        (layer.front ? front : back).addChild(sprite);
      });
      return { back, front, extraDesks: [] };
    },
    createCharacter: () => new PackCharacter(theme, sheets),
  };
}
