import { useEffect, useRef } from 'react';
import type { ThemeCharacter } from '../../../shared/theme-pack.ts';
import { themeApi } from '../themeApi.ts';

const W = 96;
const H = 150;

/** A theme character's first idle frame, fitted into the same box as the pixel previews. */
export function PackCharacterPreview({ themeId, character, title }: { themeId: string; character: ThemeCharacter; title?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const frame = character.frames[character.states.idle.frames[0]];
    const img = new Image();
    img.onload = () => {
      const ctx = ref.current?.getContext('2d');
      if (!ctx || !frame) return;
      ctx.clearRect(0, 0, W, H);
      const scale = Math.min(W / frame.w, H / frame.h);
      const w = frame.w * scale;
      const h = frame.h * scale;
      ctx.imageSmoothingEnabled = scale < 1 || frame.w > 64;
      ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, (W - w) / 2, H - h, w, h);
    };
    img.src = themeApi.previewUrl(themeId, character.sheet);
  }, [themeId, character]);

  return <canvas ref={ref} className="char-preview" width={W} height={H} title={title} />;
}
