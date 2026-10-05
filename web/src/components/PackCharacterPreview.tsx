import { useEffect, useRef } from 'react';
import { characterLayers, type ThemeCharacter } from '../../../shared/theme-pack.ts';
import { themeApi } from '../themeApi.ts';

const W = 96;
const H = 150;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** A theme character's first idle frame, its part layers and outfit included, fitted into the same box as the pixel previews. */
export function PackCharacterPreview({ themeId, character, outfit, title }: { themeId: string; character: ThemeCharacter; outfit?: string | null; title?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const frame = character.frames[character.states.idle.frames[0]];
    let live = true;
    Promise.all(characterLayers(character, outfit).map((sheet) => loadImage(themeApi.previewUrl(themeId, sheet))))
      .then((images) => {
        const ctx = ref.current?.getContext('2d');
        if (!live || !ctx || !frame) return;
        ctx.clearRect(0, 0, W, H);
        const scale = Math.min(W / frame.w, H / frame.h);
        const w = frame.w * scale;
        const h = frame.h * scale;
        ctx.imageSmoothingEnabled = scale < 1 || frame.w > 64;
        for (const img of images) ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, (W - w) / 2, H - h, w, h);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [themeId, character, outfit]);

  return <canvas ref={ref} className="char-preview" width={W} height={H} title={title} />;
}
