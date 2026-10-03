import type { Graphics } from 'pixi.js';
import { useEffect, useRef } from 'react';
import { companyOf, modelOf } from '../../../shared/models.ts';
import type { Expression, Role, Skin } from '../../../shared/types.ts';
import { drawBody, drawFace, drawHat, drawHatGlow, S } from '../office/pixelArt.ts';

type FillStyle = string | { color: string; alpha?: number };

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
    circle(x: number, y: number, r: number) {
      shape = () => {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
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
    stroke(_style: unknown) {
      // minimal for our drawing
      return g;
    },
  };
  return g as unknown as Graphics;
}

const W = 32 * S;
const H = 50 * S;

export function CharacterPreview({
  role,
  skin,
  modelId,
  expression = 'normal',
  title,
}: {
  role: Role;
  skin: Skin;
  modelId: string;
  expression?: Expression;
  title?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.translate(W / 2, H - 10 * S);
    const g = canvasGraphics(ctx);
    const model = modelOf(modelId);
    const company = companyOf(model.vendor);
    if (model.tier === 3) drawHatGlow(g, company.hat);
    const drawn = skin === 'pinkgirl' ? 'bishoujo' : skin;
    drawBody(g, role, drawn);
    drawFace(g, role, expression, drawn);
    drawHat(g, company.hat, company.color, model.tier);
  }, [role, skin, modelId, expression]);

  return <canvas ref={ref} className="char-preview" width={W} height={H} title={title} />;
}
