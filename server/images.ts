import { deflateSync } from 'node:zlib';
import { DEFAULT_IMAGE_MODEL as TEMPLATE_IMAGE_MODEL } from '../shared/task-types.ts';
import { isOpenRouterCompany } from '../shared/models.ts';
import { config } from './config.ts';
import { apiKeyFor } from './secrets.ts';
import { store } from './store.ts';

/**
 * Image generation through OpenRouter's Image API (POST /api/v1/images). The mock provider draws a plain picture
 * instead, so a journey with images runs without a key or cost.
 */

export const DEFAULT_IMAGE_MODEL = process.env.IMAGE_MODEL || TEMPLATE_IMAGE_MODEL;
export const MAX_IMAGES_PER_STEP = 4;
export const IMAGE_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];

export interface GeneratedImage {
  data: Buffer;
  mime: string;
}

const OPENROUTER = 'https://openrouter.ai/api/v1';

function openRouterKey() {
  const company = store.data.companies.find((c) => isOpenRouterCompany(c));
  const key = (company && apiKeyFor(company)) || config.keys.openrouter;
  if (!key) throw new Error('이미지를 만들려면 OpenRouter 키가 필요해요. 모델 관리에서 OpenRouter 키를 넣어 주세요.');
  return key;
}

const ratioOf = (aspect: string) => {
  const [w, h] = aspect.split(':').map(Number);
  return w && h ? w / h : NaN;
};

/**
 * The aspect ratio a model said it accepts that is closest to the one asked for, from a rejection such as
 * 'aspect_ratio: not supported. Accepted: 1:1, 3:2, 2:3, auto'; null when the message names none.
 */
export function nearestAccepted(message: string, wanted: string) {
  const accepted = message.match(/aspect_ratio[\s\S]*?Accepted:\s*([^\n.]+)/i)?.[1]?.split(',').map((a) => a.trim()) ?? [];
  const numeric = accepted.filter((a) => Number.isFinite(ratioOf(a)));
  if (!numeric.length) return accepted.includes('auto') ? 'auto' : null;
  const target = Math.log(ratioOf(wanted));
  return numeric.reduce((best, a) => (Math.abs(Math.log(ratioOf(a)) - target) < Math.abs(Math.log(ratioOf(best)) - target) ? a : best));
}

/**
 * One picture for a prompt; costUsd is what OpenRouter charged (null when it did not say). A model that does not take
 * the asked aspect ratio gets the closest one it accepts, and then none at all, before giving up.
 */
export async function generateImage(model: string, prompt: string, aspectRatio?: string): Promise<{ image: GeneratedImage; costUsd: number | null }> {
  if (store.provider === 'mock') return { image: { data: mockPicture(prompt), mime: 'image/png' }, costUsd: 0 };
  const aspect = aspectRatio && IMAGE_ASPECTS.includes(aspectRatio) ? aspectRatio : undefined;
  try {
    return await requestImage(model, prompt, aspect);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!aspect || !/aspect_ratio/i.test(message)) throw error;
    const closest = nearestAccepted(message, aspect);
    return requestImage(model, prompt, closest && closest !== 'auto' ? closest : undefined);
  }
}

async function requestImage(model: string, prompt: string, aspect: string | undefined): Promise<{ image: GeneratedImage; costUsd: number | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const res = await fetch(`${OPENROUTER}/images`, {
      method: 'POST',
      signal: controller.signal,
      headers: { authorization: `Bearer ${openRouterKey()}`, 'content-type': 'application/json', 'HTTP-Referer': 'https://avatarcast.app', 'X-Title': 'AvatarCast Office' },
      body: JSON.stringify({ model, prompt: prompt.slice(0, 4000), ...(aspect ? { aspect_ratio: aspect } : {}) }),
    });
    const body = (await res.json().catch(() => ({}))) as { data?: { b64_json?: string; media_type?: string }[]; usage?: { cost?: number | null }; error?: { message?: string } };
    if (!res.ok) {
      const reason = body.error?.message ?? `HTTP ${res.status}`;
      throw new Error(res.status === 402 ? 'OpenRouter 잔액이 부족해 이미지를 만들지 못했어요.' : `이미지를 만들지 못했어요: ${reason.slice(0, 200)}`);
    }
    const first = body.data?.find((d) => d.b64_json);
    if (!first?.b64_json) throw new Error('이미지 모델이 그림을 돌려주지 않았어요.');
    return { image: { data: Buffer.from(first.b64_json, 'base64'), mime: first.media_type || 'image/png' }, costUsd: typeof body.usage?.cost === 'number' ? body.usage.cost : null };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('이미지 생성이 3분을 넘겨 멈췄어요.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

let cachedModels: { at: number; models: { id: string; name: string }[] } | null = null;

/** The image models OpenRouter offers, cached for an hour; a short built-in list when it cannot be reached. */
export async function imageModels() {
  if (cachedModels && Date.now() - cachedModels.at < 3_600_000) return cachedModels.models;
  try {
    const res = await fetch(`${OPENROUTER}/images/models`, { signal: AbortSignal.timeout(10_000) });
    const body = (await res.json()) as { data?: { id?: string; name?: string }[] };
    const models = (body.data ?? []).filter((m): m is { id: string; name: string } => typeof m.id === 'string').map((m) => ({ id: m.id, name: m.name || m.id }));
    if (models.length) {
      cachedModels = { at: Date.now(), models };
      return models;
    }
  } catch {
    // fall through to the built-in list
  }
  return [
    { id: 'openai/gpt-image-1-mini', name: 'OpenAI GPT Image 1 Mini' },
    { id: 'google/gemini-2.5-flash-image', name: 'Google Gemini 2.5 Flash Image' },
    { id: 'openai/gpt-image-2', name: 'OpenAI GPT Image 2' },
    { id: 'bytedance-seed/seedream-4.5', name: 'Seedream 4.5' },
  ];
}

// ───────────── offline picture ─────────────

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};

/** A 256x256 gradient whose colours come from the prompt, standing in for a generated image. */
function mockPicture(prompt: string) {
  let hash = 0;
  for (const ch of prompt) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const [r, g, b] = [hash & 255, (hash >> 8) & 255, (hash >> 16) & 255];
  const size = 256;
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y++) {
    const row = [0];
    for (let x = 0; x < size; x++) row.push((r + x) & 255, (g + y) & 255, (b + x + y) & 255);
    rows.push(Buffer.from(row));
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
