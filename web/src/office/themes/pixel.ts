import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { TeamMeta } from '../../../../shared/teams.ts';
import { builtinSkin } from '../../../../shared/skins.ts';
import type { Agent, AgentSkin, Skin } from '../../../../shared/types.ts';
import { companyOf, modelOf, type HatShape, type Tier } from '../../../../shared/models.ts';
import { drawBody, drawFace, drawHat, drawHatGlow, HAT_TOP, S } from '../pixelArt.ts';
import { loadPinkGirl, type SpriteSkin } from '../skinSprites.ts';
import { DEFAULT_LAYOUT, type CharacterArt, type CharacterLook, type OfficeTheme, type RoomArt } from '../theme.ts';

/** The theme drawn in code: rectangles for the room, pixelArt.ts for people. */

const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
const SCENE_W = 1000;
const SCENE_H = 480;
const OFFICE_W = 800;
const LOUNGE_X = 810;
const { door: DOOR } = DEFAULT_LAYOUT;
const { board: BOARD, shelf: SHELF, safe: SAFE, archive: ARCHIVE } = DEFAULT_LAYOUT.spots;

/** Desks are drawn 4px above where their owner stands. */
const deskSpots = () => [...Object.values(DEFAULT_LAYOUT.seats), ...DEFAULT_LAYOUT.extraSeats].map(({ x, y }) => ({ x, y: y - 4 }));

function buildRoom(team: TeamMeta): RoomArt {
  const back = new Container();
  const g = new Graphics();
  for (let y = 120; y < SCENE_H; y += 32) {
    for (let x = 0; x < OFFICE_W; x += 32) {
      g.rect(x, y, 32, 32).fill(((x + y) / 32) % 2 === 0 ? team.floor[0] : team.floor[1]);
    }
  }
  g.rect(0, 0, SCENE_W, 120).fill(team.wall);
  g.rect(0, 112, SCENE_W, 8).fill('#a3896b');
  g.rect(0, 0, SCENE_W, 6).fill('#cbb593');

  g.rect(22, 30, 52, 82).fill('#8b5a2b');
  g.rect(28, 36, 40, 76).fill('#a86f3b');
  g.circle(60, 76, 3).fill('#f1c40f');

  g.rect(BOARD.x - 8, BOARD.y - 6, BOARD.w + 16, BOARD.h + 12).fill('#8b5a2b');
  g.rect(BOARD.x, BOARD.y, BOARD.w, BOARD.h).fill('#2f5d50');
  g.rect(BOARD.x + 20, BOARD.y + BOARD.h + 2, 50, 4).fill('#f5f5f5');

  g.rect(SHELF.x, SHELF.y, SHELF.w, SHELF.h).fill('#7a4f2a');
  const bookColors = ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#16a085'];
  for (let row = 0; row < 3; row++) {
    const y = SHELF.y + 6 + row * 29;
    g.rect(SHELF.x + 4, y + 22, SHELF.w - 8, 3).fill('#5a3a1e');
    for (let i = 0; i < 8; i++) g.rect(SHELF.x + 6 + i * 9, y + 4, 7, 18).fill(bookColors[(i + row) % bookColors.length]);
  }

  g.rect(140, 30, 70, 54).fill('#a3896b');
  g.rect(145, 35, 60, 44).fill('#bfe3ff');
  g.rect(174, 35, 2, 44).fill('#a3896b');

  g.rect(SAFE.x, SAFE.y, SAFE.w, SAFE.h).fill('#5d6d7e');
  g.rect(SAFE.x + 5, SAFE.y + 5, SAFE.w - 10, SAFE.h - 10).fill('#85929e');
  g.circle(SAFE.x + SAFE.w / 2, SAFE.y + SAFE.h / 2, 10).fill('#d5d8dc').stroke({ width: 2, color: '#34495e' });

  g.rect(ARCHIVE.x, ARCHIVE.y, ARCHIVE.w, ARCHIVE.h).fill('#b9770e');
  g.rect(ARCHIVE.x + 4, ARCHIVE.y + 4, ARCHIVE.w - 8, 10).fill('#f5cba7');

  for (const [x, y] of [
    [110, 108],
    [620, 108],
  ]) {
    g.rect(x - 8, y - 4, 16, 14).fill('#a04000');
    g.circle(x, y - 12, 12).fill('#27ae60');
    g.circle(x - 7, y - 18, 7).fill('#2ecc71');
  }
  drawLounge(g);
  back.addChild(g);

  const labels: [string, number, number][] = [
    ['금고', SAFE.x + SAFE.w / 2, SAFE.y + SAFE.h + 4],
    [team.stepLabels.done, ARCHIVE.x + ARCHIVE.w / 2, ARCHIVE.y + ARCHIVE.h + 4],
    ['자료실', SHELF.x + SHELF.w / 2, SHELF.y + SHELF.h + 2],
  ];
  for (const [text, x, y] of labels) {
    const t = new Text({ text, style: { fontFamily: FONT, fontSize: 11, fontWeight: 'bold', fill: '#5d4037' } });
    t.anchor.set(0.5, 0);
    t.position.set(x, y);
    back.addChild(t);
  }
  const sign = new Graphics();
  sign.roundRect(14, 10, 70, 18, 3).fill('#5d4037');
  back.addChild(sign);
  const signText = new Text({
    text: `${team.emoji} ${team.name}`,
    style: { fontFamily: FONT, fontSize: 11, fontWeight: 'bold', fill: '#fdf2e9' },
  });
  signText.anchor.set(0.5);
  signText.position.set(49, 19);
  back.addChild(signText);

  const loungeSign = new Graphics();
  loungeSign.roundRect(LOUNGE_X + 10, 10, 84, 20, 4).fill('#6d4c41');
  back.addChild(loungeSign);
  const loungeText = new Text({ text: '☕ 휴게실', style: { fontFamily: FONT, fontSize: 12, fontWeight: 'bold', fill: '#fff3e0' } });
  loungeText.anchor.set(0.5);
  loungeText.position.set(LOUNGE_X + 52, 20);
  back.addChild(loungeText);

  const { front, extraDesks } = buildDesks();
  return { back, front, extraDesks };
}

function drawLounge(g: Graphics) {
  const right = SCENE_W;
  for (let y = 120; y < SCENE_H; y += 16) {
    g.rect(LOUNGE_X, y, right - LOUNGE_X, 16).fill((y / 16) % 2 === 0 ? '#d4a373' : '#c9965f');
    for (let x = LOUNGE_X + ((y / 16) % 2 === 0 ? 30 : 70); x < right; x += 80) g.rect(x, y, 2, 16).fill('#b5834f');
  }
  g.rect(LOUNGE_X, 0, right - LOUNGE_X, 112).fill('#fbe7c6');
  g.rect(LOUNGE_X, 72, right - LOUNGE_X, 4).fill('#e6c89c');
  g.rect(LOUNGE_X, 112, right - LOUNGE_X, 8).fill('#a3896b');

  g.rect(OFFICE_W, 0, LOUNGE_X - OFFICE_W, 120).fill('#8d7356');
  g.rect(OFFICE_W, 120, LOUNGE_X - OFFICE_W, DOOR.y - 38 - 120).fill('#a3896b');
  g.rect(OFFICE_W, DOOR.y + 32, LOUNGE_X - OFFICE_W, SCENE_H - DOOR.y - 32).fill('#a3896b');
  g.rect(OFFICE_W - 2, DOOR.y - 42, LOUNGE_X - OFFICE_W + 4, 4).fill('#6d5843');
  g.rect(OFFICE_W - 2, DOOR.y + 32, LOUNGE_X - OFFICE_W + 4, 4).fill('#6d5843');

  g.rect(912, 22, 64, 46).fill('#a3896b');
  g.rect(916, 26, 56, 38).fill('#cdeaff');
  g.rect(943, 26, 2, 38).fill('#a3896b');
  g.rect(916, 50, 56, 3).fill('#ffffff');

  g.rect(828, 82, 88, 36).fill('#8d6e63');
  g.rect(824, 78, 96, 6).fill('#6d4c41');
  g.rect(838, 50, 30, 28).fill('#455a64');
  g.rect(842, 54, 22, 8).fill('#90a4ae');
  g.rect(848, 66, 10, 3).fill('#263238');
  g.rect(849, 70, 8, 8).fill('#fdfefe');
  g.rect(878, 68, 8, 10).fill('#e57373');
  g.rect(890, 68, 8, 10).fill('#81c784');
  g.rect(830, 90, 84, 2).fill('#5d4037');

  g.rect(950, 84, 26, 34).fill('#ecf0f1');
  g.rect(952, 60, 22, 26).fill('#aee1f9');
  g.rect(955, 63, 4, 18).fill('#e8f8ff');
  g.rect(958, 96, 8, 4).fill('#3498db');

  g.ellipse(902, 404, 82, 40).fill('#e8b4b8');
  g.ellipse(902, 404, 66, 30).fill('#f2c9cc');

  g.rect(838, 292, 128, 30).fill('#5d8aa8');
  g.rect(842, 296, 58, 22).fill('#6d9bb8');
  g.rect(904, 296, 58, 22).fill('#6d9bb8');

  g.rect(818, 452, 16, 14).fill('#a04000');
  g.circle(826, 440, 13).fill('#27ae60');
  g.circle(833, 433, 7).fill('#2ecc71');
}

function buildDesks() {
  const front = new Container();
  const extraDesks: Container[] = [];
  deskSpots().forEach(({ x, y }, i) => {
    const g = new Graphics();
    g.rect(x - 44, y - 4, 88, 10).fill('#c68642');
    g.rect(x - 44, y + 6, 88, 22).fill('#a0522d');
    g.rect(x - 40, y + 28, 6, 8).fill('#7b3f1c');
    g.rect(x + 34, y + 28, 6, 8).fill('#7b3f1c');
    g.rect(x + 22, y - 22, 20, 16).fill('#34495e');
    g.rect(x + 24, y - 20, 16, 11).fill('#85c1e9');
    g.rect(x + 30, y - 6, 4, 3).fill('#34495e');
    g.rect(x - 38, y - 8, 14, 4).fill('#fdfefe');
    front.addChild(g);
    if (i >= 4) {
      g.visible = false;
      extraDesks.push(g);
    }
  });

  const lounge = new Graphics();
  lounge.rect(834, 324, 136, 22).fill('#4a7391');
  lounge.rect(838, 324, 128, 5).fill('#5d8aa8');
  lounge.rect(830, 302, 14, 44).fill('#3f6680');
  lounge.rect(960, 302, 14, 44).fill('#3f6680');
  lounge.rect(838, 346, 6, 6).fill('#2c3e50');
  lounge.rect(960, 346, 6, 6).fill('#2c3e50');

  lounge.rect(899, 422, 8, 26).fill('#8d6e63');
  lounge.ellipse(903, 448, 16, 4).fill('#6d4c41');
  lounge.ellipse(903, 420, 30, 10).fill('#d7b98e');
  lounge.ellipse(903, 418, 30, 9).fill('#e6cba2');
  lounge.rect(890, 408, 8, 9).fill('#ffffff');
  lounge.rect(898, 410, 3, 4).fill('#ffffff');
  lounge.circle(914, 414, 4).fill('#c68642');
  lounge.circle(914, 414, 1.5).fill('#6d4c41');
  front.addChild(lounge);
  return { front, extraDesks };
}

class PixelCharacter implements CharacterArt {
  view = new Container();
  tagY = 0;
  hit = { halfW: 10 * S, h: 34 * S };
  private body = new Graphics();
  private face = new Graphics();
  private hat = new Graphics();
  private glow = new Graphics();
  private sparkles = new Graphics();
  private girl: Sprite | null = null;
  private skin: AgentSkin | null = null;
  private expression: Agent['expression'] | null = null;
  private hatKey: string | null = null;
  private hatShape: HatShape = 'beanie';
  private tier: Tier = 1;
  private hatOffset = 0;

  constructor(private pinkGirl: SpriteSkin | null) {
    if (pinkGirl) {
      this.girl = new Sprite(pinkGirl.idle);
      this.girl.anchor.set(0.5, 1);
      this.girl.scale.set(pinkGirl.scale);
      this.girl.visible = false;
    }
    this.view.addChild(this.glow, this.body, this.face);
    if (this.girl) this.view.addChild(this.girl);
    this.view.addChild(this.hat, this.sparkles);
  }

  apply(agent: Agent) {
    const skinChanged = agent.skin !== this.skin;
    // Theme characters have no pixel drawing; they show as the default look here.
    const drawn: Skin = agent.skin === 'pinkgirl' && !this.girl ? 'bishoujo' : builtinSkin(agent.skin);
    if (skinChanged) {
      this.skin = agent.skin;
      const useSprite = agent.skin === 'pinkgirl' && this.girl !== null;
      drawBody(this.body, agent.role, drawn);
      if (this.girl) this.girl.visible = useSprite;
      this.hatOffset = useSprite ? 2 * S : 0;
      this.hat.y = this.glow.y = this.sparkles.y = this.hatOffset;
      this.expression = null;
    }
    if (agent.expression !== this.expression) {
      this.expression = agent.expression;
      drawFace(this.face, agent.role, agent.expression, drawn);
    }
    const model = modelOf(agent.model);
    const company = companyOf(model.vendor);
    const hatKey = `${company.hat}:${company.color}:${model.tier}`;
    if (hatKey !== this.hatKey || skinChanged) {
      this.hatKey = hatKey;
      this.tier = model.tier;
      this.hatShape = company.hat;
      drawHat(this.hat, company.hat, company.color, model.tier);
      if (model.tier === 3) drawHatGlow(this.glow, company.hat);
      else this.glow.clear();
      this.sparkles.clear();
      this.tagY = (HAT_TOP[company.hat] - (model.tier === 3 ? 9 : 6)) * S + this.hatOffset;
    }
  }

  update(phase: number, look: CharacterLook) {
    if (this.tier === 3) this.updateAura(phase);
    if (this.girl?.visible && this.pinkGirl) {
      this.girl.texture = look.walking ? this.pinkGirl.walk[Math.floor(phase * 8) % this.pinkGirl.walk.length] : this.pinkGirl.idle;
    }
  }

  private updateAura(phase: number) {
    this.glow.alpha = 0.55 + Math.sin(phase * 3) * 0.35;
    const cy = (HAT_TOP[this.hatShape] - 22) * 0.5 * S;
    this.sparkles.clear();
    for (let i = 0; i < 3; i++) {
      const a = phase * 1.8 + (i * Math.PI * 2) / 3;
      const twinkle = (Math.sin(phase * 6 + i * 2) + 1) / 2;
      const size = 1.5 + twinkle * 2;
      this.sparkles.star(Math.cos(a) * 11 * S, cy + Math.sin(a) * 4 * S, 4, size + 1.5, size * 0.4).fill({ color: '#fff7b0', alpha: 0.4 + twinkle * 0.6 });
    }
  }
}

export async function createPixelTheme(): Promise<OfficeTheme> {
  const pinkGirl = await loadPinkGirl();
  return {
    id: 'pixel',
    layout: DEFAULT_LAYOUT,
    background: (team) => team.wall,
    buildRoom,
    createCharacter: () => new PixelCharacter(pinkGirl),
  };
}
