import { useEffect, useRef } from 'react';
import { companyOf, modelOf, tierLook } from '../../../shared/models.ts';
import { accessoriesFor, activeVariant, applyVariant, characterLayers, formFor, type ThemeCharacter, type ThemeManifest } from '../../../shared/theme-pack.ts';
import { drawHat, drawHatGlow, HAT_TOP, S } from '../office/pixelArt.ts';
import { themeApi } from '../themeApi.ts';
import { canvasGraphics } from './HatPreview.tsx';

const W = 96;
const H = 150;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const grow = (box: Box, x: number, y: number, w: number, h: number) => {
  box.x0 = Math.min(box.x0, x);
  box.y0 = Math.min(box.y0, y);
  box.x1 = Math.max(box.x1, x + w);
  box.y1 = Math.max(box.y1, y + h);
};

/**
 * A theme character's first idle frame, its part layers and outfit included, fitted into the same box as the pixel previews.
 * With `wearing`, it also looks as that model does in the office: the character's look for the model, the theme's own
 * accessories, or else the model's pixel hat.
 */
export function PackCharacterPreview({
  themeId,
  character,
  outfit,
  wearing,
  title,
}: {
  themeId: string;
  character: ThemeCharacter;
  outfit?: string | null;
  wearing?: { theme: ThemeManifest; modelId: string };
  title?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = wearing?.theme;
  const modelId = wearing?.modelId;

  useEffect(() => {
    const frame = character.frames[character.states.idle.frames[0]];
    if (!frame) return;
    let live = true;
    const model = modelId ? modelOf(modelId) : null;
    const company = model && companyOf(model.vendor);
    const look = theme && applyVariant(theme, activeVariant(theme, new Date()));
    // The character's look for this model (Super Saiyan 2…) brings its own sprite and, when it has them, accessories.
    const form = model ? (formFor(character, model)?.form ?? null) : null;
    const own = form?.accessories ?? (look && company && model ? accessoriesFor(look, { id: model.id, vendor: company.id, tier: model.tier }) : null);
    const seasonal = look?.wear ?? [];
    const accessories = own || seasonal.length ? [...(own ?? []), ...seasonal] : [];
    const pixelHat = Boolean(company && model && !own && !seasonal.length);
    const hatLook = model ? tierLook(model.tier) : 1;

    Promise.all([
      Promise.all(characterLayers(character, outfit, form).map((sheet) => loadImage(themeApi.previewUrl(themeId, sheet)))),
      Promise.all(accessories.map((layer) => loadImage(themeApi.previewUrl(themeId, layer.image)))),
    ])
      .then(([images, worn]) => {
        const ctx = ref.current?.getContext('2d');
        if (!live || !ctx) return;
        // Everything is laid out in scene pixels around the feet, as the office does, then fitted into the box.
        const cs = character.scale;
        const body = { x: -character.anchor.x * frame.w * cs, y: -character.anchor.y * frame.h * cs, w: frame.w * cs, h: frame.h * cs };
        const head = { x: (character.head.x - character.anchor.x) * frame.w * cs, y: (character.head.y - character.anchor.y) * frame.h * cs };
        const hand = { x: (character.hand.x - character.anchor.x) * frame.w * cs, y: (character.hand.y - character.anchor.y) * frame.h * cs };
        const box: Box = { x0: body.x, y0: body.y, x1: body.x + body.w, y1: body.y + body.h };
        const placed = accessories.map((layer, i) => {
          const at = layer.at === 'hand' ? hand : head;
          const w = worn[i].width * layer.scale;
          const h = worn[i].height * layer.scale;
          const rect = { img: worn[i], x: at.x + layer.x - w / 2, y: at.y + layer.y - h / 2, w, h };
          grow(box, rect.x, rect.y, w, h);
          return rect;
        });
        // Pixel hats are drawn for a head whose top is at y = -22·S, so they sit 23·S below the head point.
        const hatY = head.y + 23 * S;
        if (pixelHat && company && model) grow(box, head.x - 14 * S, hatY + (HAT_TOP[company.hat] - (hatLook === 3 ? 9 : 4)) * S, 28 * S, 1);

        const fit = Math.min(W / (box.x1 - box.x0), H / (box.y1 - box.y0));
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.translate((W - (box.x1 - box.x0) * fit) / 2 - box.x0 * fit, H - box.y1 * fit);
        ctx.scale(fit, fit);
        ctx.imageSmoothingEnabled = fit * cs < 1 || frame.w > 64;
        if (pixelHat && company && hatLook === 3) {
          ctx.save();
          ctx.translate(head.x, hatY);
          drawHatGlow(canvasGraphics(ctx), company.hat);
          ctx.restore();
        }
        for (const img of images) ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, body.x, body.y, body.w, body.h);
        for (const p of placed) ctx.drawImage(p.img, p.x, p.y, p.w, p.h);
        if (pixelHat && company && model) {
          ctx.translate(head.x, hatY);
          drawHat(canvasGraphics(ctx), company.hat, company.color, hatLook);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [themeId, character, outfit, theme, modelId]);

  return <canvas ref={ref} className="char-preview" width={W} height={H} title={title} />;
}
