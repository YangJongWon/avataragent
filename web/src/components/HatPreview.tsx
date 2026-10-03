import type { Graphics } from 'pixi.js';
import { useEffect, useRef } from 'react';
import type { HatShape, Tier } from '../../../shared/models.ts';
import { drawHat, drawHatGlow, S } from '../office/pixelArt.ts';

type FillStyle = string | { color: string; alpha?: number };

// The pixel-art helpers only call rect/ellipse + fill, so a tiny canvas adapter can reuse them.
function canvasGraphics(ctx: CanvasRenderingContext2D) {
  let shape: (() => void) | null = null;
  const g = {
    clear: () => g,
    rect(x: number, y: number, w: number, h: number) {
      shape = () => ctx.fillRect(x, y, w, h);
      return g;
    },
    ellipse(x: number, y: number, rx: number, ry: number) {
      shape = () => {
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      };
      return g;
    },
    fill(style: FillStyle) {
      ctx.fillStyle = typeof style === 'string' ? style : style.color;
      ctx.globalAlpha = typeof style === 'string' ? 1 : (style.alpha ?? 1);
      shape?.();
      ctx.globalAlpha = 1;
      return g;
    },
  };
  return g as unknown as Graphics;
}

const W = 22 * S;
const H = 26 * S;

export function HatPreview({ hat, color, tier, title }: { hat: HatShape; color: string; tier: Tier; title?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.translate(W / 2, H + 10 * S);
    const g = canvasGraphics(ctx);
    if (tier === 3) drawHatGlow(g, hat);
    const px = (x: number, y: number, w: number, h: number, c: string) => g.rect(x * S, y * S, w * S, h * S).fill(c);
    px(-6, -21, 12, 9, '#f5d0a9');
    px(-6, -21, 12, 2, '#3b2a20');
    px(-3, -17, 1, 1, '#222222');
    px(2, -17, 1, 1, '#222222');
    drawHat(g, hat, color, tier);
  }, [hat, color, tier]);

  return <canvas ref={ref} className="hat-preview" width={W} height={H} title={title} />;
}
