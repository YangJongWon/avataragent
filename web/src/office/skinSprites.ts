import { Assets, Rectangle, Texture } from 'pixi.js';

export interface SpriteSkin {
  idle: Texture;
  walk: Texture[];
  scale: number;
}

let pinkGirl: Promise<SpriteSkin | null> | null = null;

// Frame centers measured from girlwithclothes16x16.png (80px cell pitch, feet on row 31).
export function loadPinkGirl() {
  pinkGirl ??= Assets.load<Texture>('/skins/girlwithclothes16x16.png')
    .then((base) => {
      base.source.scaleMode = 'nearest';
      const frame = (cx: number) => new Texture({ source: base.source, frame: new Rectangle(cx - 8, 14, 16, 18) });
      return { idle: frame(119), walk: [519, 599, 679, 759].map(frame), scale: 4 };
    })
    .catch((error) => {
      console.warn('pink girl skin failed to load', error);
      return null;
    });
  return pinkGirl;
}
