import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { companyOf, modelOf } from '../../../../shared/models.ts';
import {
  accessoriesFor,
  activeVariant,
  applyVariant,
  characterFor,
  characterLayers,
  isThemeState,
  outfitFor,
  parseThemeManifest,
  resolveState,
  manifestFiles,
  type AccessoryLayer,
  type ThemeCharacter,
  type ThemeManifest,
  type ThemeState,
} from '../../../../shared/theme-pack.ts';
import type { Agent } from '../../../../shared/types.ts';
import { drawHat, drawHatGlow, HAT_TOP, S } from '../pixelArt.ts';
import { mergeLayout, type CharacterArt, type CharacterLook, type OfficeTheme, type PropArt, type RoomArt } from '../theme.ts';

/** A theme built from an installed package: picture layers for the room, sprite sheets for people. */

/** Statuses that should show even over a happy face. */
const URGENT = new Set<string>(['help_requested', 'error', 'paused', 'awaiting_approval']);

/**
 * The state a character wants to show; the package may not have it, so resolveState picks what it does have.
 * Facing away only asks for a back view the package has: without one, walking stays a walk and standing stays a face.
 */
export function wantedState(look: CharacterLook, has: (state: ThemeState) => boolean = () => false): ThemeState {
  if (look.moment) return look.moment;
  if (look.walking) return !look.back ? 'walk' : has('walk_back') ? 'walk_back' : has('back') ? 'back' : 'walk';
  if (URGENT.has(look.status) && isThemeState(look.status)) return look.status;
  if (look.back && has('back')) return 'back';
  if (look.expression !== 'normal' && isThemeState(look.expression)) return look.expression;
  if (isThemeState(look.status) && look.status !== 'idle') return look.status;
  return look.place === 'desk' ? 'sit' : 'idle';
}

type Frames = Map<string, Texture>;

class PackCharacter implements CharacterArt {
  view = new Container();
  characterId?: string;
  tagY = 0;
  hit = { halfW: 30, h: 100 };
  /** One sprite per stacked sheet: the body (or an outfit's whole sprite), then legs, body and head parts. */
  private body = new Container();
  private layers: { sprite: Sprite; frames: Frames }[] = [];
  private hat = new Graphics();
  private glow = new Graphics();
  private character: ThemeCharacter | null = null;
  /** The outfit the staff picked, and the one shown (undefined until the first frame dresses them). */
  private picked: string | undefined;
  private outfit: string | null | undefined;
  private state: ThemeState | null = null;
  private stateStart = 0;
  private headY = 0;
  private headX = 0;
  private hand = { x: 0, y: 0 };
  /** The theme's own accessories for the agent's company and tier, shown instead of the pixel hat. */
  private worn = new Container();
  private wornKey = '';

  constructor(
    private theme: ThemeManifest,
    private framesOf: (character: ThemeCharacter, sheet: string) => Frames,
    private textures: Map<string, Texture>,
  ) {
    this.view.addChild(this.glow, this.body, this.worn, this.hat);
  }

  apply(agent: Agent) {
    const character = characterFor(this.theme, agent.skin, agent.role);
    this.picked = agent.outfit;
    if (character !== this.character) {
      this.character = character;
      this.characterId = character.id;
      this.outfit = undefined;
      this.state = null;
      const idle = character.frames[character.states.idle.frames[0]];
      const { scale, anchor, head, hand } = character;
      this.headY = (head.y - anchor.y) * idle.h * scale;
      this.headX = (head.x - anchor.x) * idle.w * scale;
      this.hand = { x: (hand.x - anchor.x) * idle.w * scale, y: (hand.y - anchor.y) * idle.h * scale };
      this.hat.x = this.glow.x = this.headX;
      this.hit = { halfW: (idle.w * scale) / 2, h: anchor.y * idle.h * scale };
      this.wornKey = '';
    }
    const model = modelOf(agent.model);
    const company = companyOf(model.vendor);
    const own = accessoriesFor(this.theme.accessories, company.id, model.tier);
    const seasonal = this.theme.wear ?? [];
    const layers = own || seasonal.length ? [...(own ?? []), ...seasonal] : null;
    this.hat.visible = this.glow.visible = !layers;
    if (layers) return this.wear(layers, `${company.id}:${model.tier}`);
    this.worn.removeChildren();
    this.wornKey = '';
    // Themes without accessories for this company show the model's pixel hat on the character's head.
    drawHat(this.hat, company.hat, company.color, model.tier);
    if (model.tier === 3) drawHatGlow(this.glow, company.hat);
    else this.glow.clear();
    // Pixel hats are drawn for a head whose top is at y = -22·S; their brim covers the top 1·S of it.
    this.hat.y = this.glow.y = this.headY + 23 * S;
    this.tagY = this.hat.y + (HAT_TOP[company.hat] - (model.tier === 3 ? 9 : 6)) * S;
  }

  update(phase: number, look: CharacterLook) {
    const character = this.character;
    if (!character) return;
    const outfit = outfitFor(character, look.dress ?? [], this.picked);
    if (outfit !== this.outfit) this.dress(character, outfit);
    const states = character.states;
    const state = resolveState(states, wantedState(look, (s) => Boolean(states[s])));
    if (state !== this.state) {
      this.state = state;
      this.stateStart = phase;
    }
    const clip = states[state]!;
    const step = Math.floor((phase - this.stateStart) * clip.fps);
    const index = clip.loop ? step % clip.frames.length : Math.min(step, clip.frames.length - 1);
    for (const layer of this.layers) layer.sprite.texture = layer.frames.get(clip.frames[index])!;
    if (this.glow.visible) this.glow.alpha = 0.55 + Math.sin(phase * 3) * 0.35;
  }

  private dress(character: ThemeCharacter, outfit: string | null) {
    this.outfit = outfit;
    this.body.removeChildren().forEach((child) => child.destroy());
    this.layers = characterLayers(character, outfit).map((sheet) => {
      const sprite = new Sprite();
      sprite.anchor.set(character.anchor.x, character.anchor.y);
      sprite.scale.set(character.scale);
      this.body.addChild(sprite);
      return { sprite, frames: this.framesOf(character, sheet) };
    });
  }

  private wear(layers: AccessoryLayer[], key: string) {
    let top = this.headY;
    for (const layer of layers) {
      const texture = this.textures.get(layer.image)!;
      if (layer.at === 'head') top = Math.min(top, this.headY + layer.y - (texture.height * layer.scale) / 2);
    }
    this.tagY = top - 14;
    if (key === this.wornKey) return;
    this.wornKey = key;
    this.worn.removeChildren().forEach((child) => child.destroy());
    for (const layer of layers) {
      const sprite = new Sprite(this.textures.get(layer.image)!);
      sprite.anchor.set(0.5);
      sprite.scale.set(layer.scale);
      const at = layer.at === 'hand' ? this.hand : { x: this.headX, y: this.headY };
      sprite.position.set(at.x + layer.x, at.y + layer.y);
      this.worn.addChild(sprite);
    }
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

const isPortrait = (theme: ThemeManifest, path: string) => theme.characters.some((c) => Object.values(c.portraits).includes(path));

/** Gets the texture for a package file; installed themes load by URL, the theme studio from images in memory. */
export type TextureLoader = (path: string) => Promise<Texture>;

/** Builds the theme as it looks at `now`, with the dated variant (Halloween…) that holds then. */
export async function createPackTheme(base: ThemeManifest, loadTexture: TextureLoader, now: Date = new Date()): Promise<OfficeTheme> {
  const variant = activeVariant(base, now);
  const theme = { ...applyVariant(base, variant), variants: [] };
  const pageOnly = new Set([theme.preview, theme.css, theme.site.background?.image, typeof theme.site.font === 'object' ? theme.site.font.file : null]);
  const images = [...new Set(manifestFiles(theme).filter((path) => !pageOnly.has(path) && !isPortrait(theme, path)))];
  const loaded = new Map<string, Texture>();
  await Promise.all(
    images.map(async (path) => {
      const texture = await loadTexture(path);
      texture.source.scaleMode = theme.scene.scaleMode;
      loaded.set(path, texture);
    }),
  );

  // Every sheet of a character (parts, outfits) is cut with that character's frame rectangles.
  const cut = new Map<string, Frames>();
  const framesOf = (character: ThemeCharacter, sheet: string) => {
    const key = `${character.id}\n${sheet}`;
    let frames = cut.get(key);
    if (!frames) {
      const source = loaded.get(sheet)!.source;
      frames = new Map(Object.entries(character.frames).map(([name, f]) => [name, new Texture({ source, frame: new Rectangle(f.x, f.y, f.w, f.h) })]));
      cut.set(key, frames);
    }
    return frames;
  };

  return {
    id: theme.id,
    layout: mergeLayout(theme.scene),
    background: (team) => team.wall,
    buildRoom(team): RoomArt {
      const back = new Container();
      const front = new Container();
      // Team colors go on the work space; themes without spaces tint their first layer, the whole room.
      const hasAreas = theme.scene.layers.some((l) => l.area);
      theme.scene.layers.forEach((layer, i) => {
        const sprite = new Sprite(loaded.get(layer.image)!);
        sprite.position.set(layer.x, layer.y);
        const tint = theme.scene.teamTint[team.id];
        if (tint && (hasAreas ? layer.area === 'work' : i === 0)) sprite.tint = tint;
        (layer.front ? front : back).addChild(sprite);
      });
      const props = new Map<string, PropArt>();
      for (const prop of theme.props) {
        const sprite = new Sprite(loaded.get(prop.image)!);
        sprite.position.set(prop.x, prop.y);
        (prop.front ? front : back).addChild(sprite);
        props.set(prop.id, {
          spot: prop.spot,
          has: (state) => state in prop.states,
          setState: (state) => {
            sprite.texture = loaded.get((state && prop.states[state]) || prop.image)!;
          },
        });
      }
      return { back, front, extraDesks: [], props };
    },
    createCharacter: () => new PackCharacter(theme, framesOf, loaded),
    emotes: theme.emotes,
    interactions: theme.interactions,
    events: theme.events,
    dress: theme.dress,
    texture: (path) => loaded.get(path),
    variant: variant?.id ?? null,
    variantAt: (at) => activeVariant(base, at)?.id ?? null,
  };
}
