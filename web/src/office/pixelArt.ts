import type { Graphics } from 'pixi.js';
import type { Tier, Vendor } from '../../../shared/models.ts';
import type { Expression, Role, Skin } from '../../../shared/types.ts';

export const S = 3;

const SKIN = '#f5d0a9';
const LEGS = '#3b3b58';
const EYE = '#222222';
const MOUTH = '#a0522d';

const px = (g: Graphics, x: number, y: number, w: number, h: number, color: string) => {
  g.rect(x * S, y * S, w * S, h * S).fill(color);
};

const HAIR: Record<Role, string> = {
  manager: '#3b2a20',
  researcher: '#c98b3a',
  writer: '#6b3f2a',
  reviewer: '#222222',
};

const SHIRT: Record<Role, string> = {
  manager: '#4a5a8a',
  researcher: '#9a7650',
  writer: '#5a9a6a',
  reviewer: '#eeeeee',
};

const GIRL = {
  hair: { manager: '#3a3f5c', researcher: '#e8b04b', writer: '#e07aa0', reviewer: '#9fb4e8' } as Record<Role, string>,
  hairShade: { manager: '#2a2e45', researcher: '#c48f32', writer: '#bf5c82', reviewer: '#7f93c8' } as Record<Role, string>,
  blouse: { manager: '#ffffff', researcher: '#fff6e0', writer: '#ffffff', reviewer: '#eef1f5' } as Record<Role, string>,
  skirt: { manager: '#3c4a7a', researcher: '#a0784e', writer: '#4f8f60', reviewer: '#555a6e' } as Record<Role, string>,
  ribbon: { manager: '#d63b4b', researcher: '#3fae6a', writer: '#ff7eb6', reviewer: '#4a7bd6' } as Record<Role, string>,
};
const GIRL_EYE = '#4a2f6b';

function drawGirlBody(g: Graphics, role: Role) {
  const hair = GIRL.hair[role];
  const shade = GIRL.hairShade[role];
  const skirt = GIRL.skirt[role];
  const blouse = GIRL.blouse[role];
  const ribbon = GIRL.ribbon[role];

  px(g, -7, -20, 14, 12, shade);
  px(g, -6, -9, 12, 1, shade);

  px(g, -3, -4, 2, 3, SKIN);
  px(g, 1, -4, 2, 3, SKIN);
  px(g, -3, -2, 2, 1, '#ffffff');
  px(g, 1, -2, 2, 1, '#ffffff');
  px(g, -3, -1, 2, 1, '#5a3a2a');
  px(g, 1, -1, 2, 1, '#5a3a2a');

  px(g, -5, -7, 10, 2, skirt);
  px(g, -6, -5, 12, 1, skirt);
  g.rect(-3 * S, -6 * S, S, 2 * S).fill({ color: '#000000', alpha: 0.15 });
  g.rect(2 * S, -6 * S, S, 2 * S).fill({ color: '#000000', alpha: 0.15 });

  px(g, -4, -12, 8, 5, blouse);
  px(g, -6, -11, 2, 5, blouse);
  px(g, 4, -11, 2, 5, blouse);
  px(g, -6, -6, 2, 1, SKIN);
  px(g, 4, -6, 2, 1, SKIN);
  px(g, -4, -12, 8, 1, skirt);
  px(g, -1, -11, 2, 1, ribbon);
  px(g, -2, -10, 1, 1, ribbon);
  px(g, 1, -10, 1, 1, ribbon);

  px(g, -5, -21, 10, 9, SKIN);

  px(g, -5, -22, 10, 2, hair);
  px(g, -5, -20, 3, 1, hair);
  px(g, -1, -20, 2, 1, hair);
  px(g, 3, -20, 2, 1, hair);
  px(g, -4, -19, 1, 1, hair);
  px(g, 3, -19, 1, 1, hair);
  px(g, -6, -21, 1, 10, hair);
  px(g, 5, -21, 1, 10, hair);
  g.rect(-3 * S, -22 * S, 2 * S, S).fill({ color: '#ffffff', alpha: 0.35 });

  switch (role) {
    case 'manager':
      px(g, 3, -21, 2, 1, '#f4c430');
      break;
    case 'researcher':
      px(g, -8, -20, 2, 2, ribbon);
      px(g, -7, -19, 1, 1, '#ffffff');
      g.circle(8 * S, -7 * S, 2.3 * S).stroke({ width: S * 0.8, color: '#555555' });
      g.circle(8 * S, -7 * S, 1.6 * S).fill({ color: '#bfe3ff', alpha: 0.7 });
      px(g, 6, -5, 1, 2, '#6b4a2b');
      break;
    case 'writer':
      px(g, 4, -22, 2, 2, '#fff07a');
      px(g, 5, -23, 1, 1, '#ffffff');
      px(g, 7, -9, 1, 4, '#f1c40f');
      px(g, 7, -5, 1, 1, '#333333');
      break;
    case 'reviewer':
      px(g, 7, -9, 1, 4, '#e74c3c');
      break;
  }
}

function drawGirlFace(g: Graphics, role: Role, expression: Expression) {
  const bigEyes = (dy = 0) => {
    px(g, -4, -18 + dy, 2, 3, GIRL_EYE);
    px(g, 2, -18 + dy, 2, 3, GIRL_EYE);
    px(g, -4, -18 + dy, 1, 1, '#ffffff');
    px(g, 2, -18 + dy, 1, 1, '#ffffff');
    px(g, -5, -19 + dy, 3, 1, EYE);
    px(g, 2, -19 + dy, 3, 1, EYE);
  };
  const happyEyes = () => {
    px(g, -5, -17, 1, 1, EYE);
    px(g, -4, -18, 2, 1, EYE);
    px(g, -2, -17, 1, 1, EYE);
    px(g, 1, -17, 1, 1, EYE);
    px(g, 2, -18, 2, 1, EYE);
    px(g, 4, -17, 1, 1, EYE);
  };
  const blush = (strong = false) => {
    g.rect(-5 * S, -15 * S, 2 * S, S).fill({ color: '#ff8fa8', alpha: strong ? 0.9 : 0.5 });
    g.rect(3 * S, -15 * S, 2 * S, S).fill({ color: '#ff8fa8', alpha: strong ? 0.9 : 0.5 });
  };
  const sweatDrop = () => {
    px(g, 6, -20, 1, 1, '#5dade2');
    px(g, 6, -19, 2, 2, '#5dade2');
  };
  const mouth = (color = '#c0505a') => px(g, 0, -14, 1, 1, color);

  switch (expression) {
    case 'smile':
      happyEyes();
      px(g, -1, -14, 2, 1, '#c0505a');
      blush();
      break;
    case 'focus':
      px(g, -4, -17, 2, 2, GIRL_EYE);
      px(g, 2, -17, 2, 2, GIRL_EYE);
      px(g, -5, -18, 3, 1, EYE);
      px(g, 2, -18, 3, 1, EYE);
      mouth();
      blush();
      break;
    case 'sweat':
      bigEyes();
      mouth();
      blush();
      sweatDrop();
      break;
    case 'troubled':
      px(g, -4, -17, 2, 2, GIRL_EYE);
      px(g, 2, -17, 2, 2, GIRL_EYE);
      px(g, -4, -17, 1, 1, '#ffffff');
      px(g, 2, -17, 1, 1, '#ffffff');
      px(g, -5, -18, 2, 1, EYE);
      px(g, -3, -19, 1, 1, EYE);
      px(g, 3, -18, 2, 1, EYE);
      px(g, 2, -19, 1, 1, EYE);
      px(g, -1, -14, 1, 1, '#c0505a');
      px(g, 0, -13, 1, 1, '#c0505a');
      px(g, 1, -14, 1, 1, '#c0505a');
      px(g, -4, -15, 1, 1, '#7fc8f8');
      blush(true);
      sweatDrop();
      break;
    case 'panic':
      px(g, -5, -19, 1, 1, EYE);
      px(g, -4, -18, 1, 1, EYE);
      px(g, -5, -17, 1, 1, EYE);
      px(g, 4, -19, 1, 1, EYE);
      px(g, 3, -18, 1, 1, EYE);
      px(g, 4, -17, 1, 1, EYE);
      px(g, -1, -15, 2, 2, '#7b241c');
      blush(true);
      sweatDrop();
      break;
    case 'thanks':
    case 'celebrate':
      happyEyes();
      px(g, -1, -14, 2, 1, '#c0505a');
      px(g, -1, -13, 2, 1, '#ff8a8a');
      blush(true);
      break;
    default:
      bigEyes();
      mouth();
      blush();
  }

  if (role === 'reviewer') {
    const frame = { width: S * 0.6, color: '#7a4b8a' };
    g.rect(-5 * S, -19 * S, 4 * S, 4 * S).stroke(frame);
    g.rect(1 * S, -19 * S, 4 * S, 4 * S).stroke(frame);
    px(g, -1, -18, 2, 0.4, '#7a4b8a');
  }
}

export function drawBody(g: Graphics, role: Role, skin: Skin = 'pixel') {
  g.clear();
  if (skin === 'bishoujo') return drawGirlBody(g, role);
  if (skin !== 'pixel') return;
  const shirt = SHIRT[role];

  px(g, -4, -4, 3, 4, LEGS);
  px(g, 1, -4, 3, 4, LEGS);
  px(g, -4, -1, 3, 1, '#2a2a2a');
  px(g, 1, -1, 3, 1, '#2a2a2a');

  px(g, -5, -12, 10, 8, shirt);
  px(g, -7, -11, 2, 6, shirt);
  px(g, 5, -11, 2, 6, shirt);
  px(g, -7, -5, 2, 1, SKIN);
  px(g, 5, -5, 2, 1, SKIN);

  px(g, -5, -21, 10, 9, SKIN);
  px(g, -6, -18, 1, 2, SKIN);
  px(g, 5, -18, 1, 2, SKIN);

  const hair = HAIR[role];
  px(g, -5, -22, 10, 2, hair);
  px(g, -6, -21, 1, 3, hair);
  px(g, 5, -21, 1, 3, hair);

  switch (role) {
    case 'manager':
      px(g, -3, -12, 2, 1, '#ffffff');
      px(g, 1, -12, 2, 1, '#ffffff');
      px(g, -1, -12, 2, 5, '#c0392b');
      break;
    case 'researcher':
      px(g, -5, -7, 10, 1, '#5a3e22');
      g.circle(8 * S, -7 * S, 2.3 * S).stroke({ width: S * 0.8, color: '#555555' });
      g.circle(8 * S, -7 * S, 1.6 * S).fill({ color: '#bfe3ff', alpha: 0.7 });
      px(g, 6, -5, 1, 2, '#6b4a2b');
      break;
    case 'writer':
      px(g, 7, -9, 1, 4, '#f1c40f');
      px(g, 7, -5, 1, 1, '#333333');
      break;
    case 'reviewer':
      px(g, -1, -11, 1, 1, '#999999');
      px(g, -1, -8, 1, 1, '#999999');
      px(g, 7, -9, 1, 4, '#e74c3c');
      break;
  }
}

const GOLD = '#f4c430';
const GOLD_DARK = '#b8860b';

// Top of each hat in pixel units; used to place the gem, glow and role tag.
export const HAT_TOP: Record<Vendor, number> = { claude: -27, gpt: -26, grok: -27, gemini: -33 };
const HAT_BAND: Record<Vendor, { x: number; y: number; w: number }> = {
  claude: { x: -6, y: -22, w: 12 },
  gpt: { x: -5, y: -23, w: 10 },
  grok: { x: -6, y: -24, w: 12 },
  gemini: { x: -5, y: -24, w: 10 },
};

export function drawHat(g: Graphics, vendor: Vendor, tier: Tier) {
  g.clear();
  switch (vendor) {
    case 'claude':
      px(g, -6, -25, 12, 4, '#d97757');
      px(g, -5, -26, 10, 1, '#d97757');
      px(g, -6, -22, 12, 1, '#b85c3e');
      px(g, -1, -24, 3, 1, '#fff3e8');
      px(g, 0, -25, 1, 3, '#fff3e8');
      px(g, -1, -28, 2, 2, '#f0b49e');
      break;
    case 'gpt':
      px(g, -5, -25, 10, 3, '#1f1f1f');
      px(g, -4, -26, 8, 1, '#1f1f1f');
      px(g, -5, -22, 10, 1, '#111111');
      px(g, 3, -22, 6, 1, '#111111');
      px(g, -1, -25, 2, 2, '#ffffff');
      px(g, -2, -24, 1, 1, '#ffffff');
      px(g, 1, -25, 1, 1, '#ffffff');
      break;
    case 'grok':
      px(g, -6, -26, 12, 5, '#2b2b2b');
      px(g, -5, -27, 10, 1, '#2b2b2b');
      px(g, -6, -23, 12, 1, '#9fb3c8');
      px(g, -5, -22, 10, 1, '#5d6d7e');
      px(g, 1, -26, 1, 1, '#ffffff');
      px(g, 0, -25, 1, 1, '#ffffff');
      px(g, -1, -24, 1, 1, '#ffffff');
      break;
    case 'gemini':
      px(g, -7, -22, 14, 1, '#3b5bdb');
      px(g, -5, -24, 10, 2, '#4c6ef5');
      px(g, -4, -26, 8, 2, '#5c7cfa');
      px(g, -3, -28, 6, 2, '#748ffc');
      px(g, -2, -30, 4, 2, '#91a7ff');
      px(g, -1, -32, 2, 2, '#a5b4fc');
      px(g, 0, -33, 1, 1, '#c5cdfd');
      px(g, -1, -27, 3, 1, '#fff6c2');
      px(g, 0, -28, 1, 3, '#fff6c2');
      break;
  }

  if (tier >= 2) {
    const band = HAT_BAND[vendor];
    px(g, band.x, band.y, band.w, 1, GOLD);
    px(g, band.x, band.y, 1, 1, GOLD_DARK);
    px(g, band.x + band.w - 1, band.y, 1, 1, GOLD_DARK);
  }
  if (tier === 3) {
    const top = HAT_TOP[vendor];
    px(g, -1, top - 1, 3, 1, GOLD);
    px(g, -1, top - 2, 1, 1, GOLD);
    px(g, 1, top - 2, 1, 1, GOLD);
    px(g, 0, top - 2, 1, 1, '#ff4fa3');
    px(g, 0, top - 3, 1, 1, GOLD);
  }
}

export function drawHatGlow(g: Graphics, vendor: Vendor) {
  g.clear();
  const top = HAT_TOP[vendor] - 3;
  const centerY = ((top - 22) / 2) * S;
  const ry = ((-22 - top) / 2 + 3) * S;
  g.ellipse(0, centerY, 10 * S, ry).fill({ color: '#fff3a0', alpha: 0.35 });
  g.ellipse(0, centerY, 7.5 * S, ry * 0.75).fill({ color: '#ffe066', alpha: 0.45 });
}

export function drawFace(g: Graphics, role: Role, expression: Expression, skin: Skin = 'pixel') {
  g.clear();
  if (skin === 'bishoujo') return drawGirlFace(g, role, expression);
  if (skin !== 'pixel') return;
  const happyEyes = () => {
    px(g, -4, -17, 1, 1, EYE);
    px(g, -3, -18, 1, 1, EYE);
    px(g, -2, -17, 1, 1, EYE);
    px(g, 1, -17, 1, 1, EYE);
    px(g, 2, -18, 1, 1, EYE);
    px(g, 3, -17, 1, 1, EYE);
  };
  const smileMouth = () => {
    px(g, -2, -15, 1, 1, MOUTH);
    px(g, -1, -14, 2, 1, MOUTH);
    px(g, 1, -15, 1, 1, MOUTH);
  };
  const blush = () => {
    px(g, -5, -15, 2, 1, '#f5a3a3');
    px(g, 3, -15, 2, 1, '#f5a3a3');
  };
  const sweatDrop = () => {
    px(g, 6, -20, 1, 1, '#5dade2');
    px(g, 6, -19, 2, 2, '#5dade2');
  };
  const normalEyes = () => {
    px(g, -3, -18, 1, 2, EYE);
    px(g, 2, -18, 1, 2, EYE);
  };

  switch (expression) {
    case 'smile':
      happyEyes();
      smileMouth();
      break;
    case 'focus':
      px(g, -4, -17, 2, 1, EYE);
      px(g, 1, -17, 2, 1, EYE);
      px(g, -1, -14, 2, 1, MOUTH);
      break;
    case 'sweat':
      normalEyes();
      px(g, -1, -14, 2, 1, MOUTH);
      sweatDrop();
      break;
    case 'troubled':
      px(g, -3, -17, 1, 2, EYE);
      px(g, 2, -17, 1, 2, EYE);
      px(g, -4, -19, 1, 1, EYE);
      px(g, -3, -20, 1, 1, EYE);
      px(g, 2, -20, 1, 1, EYE);
      px(g, 3, -19, 1, 1, EYE);
      px(g, -2, -14, 1, 1, MOUTH);
      px(g, -1, -13, 1, 1, MOUTH);
      px(g, 0, -14, 1, 1, MOUTH);
      px(g, 1, -13, 1, 1, MOUTH);
      sweatDrop();
      break;
    case 'panic':
      px(g, -4, -18, 2, 2, EYE);
      px(g, 2, -18, 2, 2, EYE);
      px(g, -1, -15, 2, 2, '#7b241c');
      sweatDrop();
      break;
    case 'thanks':
    case 'celebrate':
      happyEyes();
      smileMouth();
      blush();
      break;
    default:
      normalEyes();
      px(g, -1, -14, 2, 1, MOUTH);
  }

  if (role === 'reviewer') {
    const frame = { width: S * 0.6, color: '#444444' };
    g.rect(-5 * S, -19 * S, 4 * S, 3 * S).stroke(frame);
    g.rect(0, -19 * S, 4 * S, 3 * S).stroke(frame);
    px(g, -1, -18, 1, 0.4, '#444444');
  }
}
