import { randomUUID } from 'node:crypto';
import { parseFlowPack, type FlowPack } from '../shared/flow-pack.ts';
import { parsePlaybook } from '../shared/playbook.ts';
import { THEME_LIMITS } from '../shared/theme-pack.ts';
import type { SavedFlow } from '../shared/types.ts';
import { config } from './config.ts';
import { store } from './store.ts';
import { importTheme } from './themes.ts';

/**
 * The app's window on the project site's community. The browser never talks to the site for this: the server
 * fetches from SITE_URL only, by item id, and installs with the same code as a manual import.
 */

const ITEM_ID = /^itm_[A-Za-z0-9_-]{6,30}$/;
export const MAX_FLOWS = 50;

let fetchImpl: typeof fetch = (...args) => fetch(...args);
/** Tests swap in a fake site. */
export const setCommunityFetch = (impl: typeof fetch) => void (fetchImpl = impl);

function site() {
  if (!config.siteUrl) throw new Error('SITE_URL이 설정되지 않아 커뮤니티에 연결할 수 없어요.');
  return config.siteUrl;
}

function itemId(id: unknown) {
  if (typeof id !== 'string' || !ITEM_ID.test(id)) throw new Error('없는 항목이에요.');
  return id;
}

async function get(path: string) {
  let res: Response;
  try {
    res = await fetchImpl(`${site()}${path}`, { signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new Error('커뮤니티 사이트에 연결할 수 없어요.');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `커뮤니티 사이트가 응답하지 않아요 (${res.status}).`);
  }
  return res;
}

const QUERY_KEYS = ['type', 'q', 'tag', 'sort', 'limit', 'offset'];

export async function communityList(query: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const key of QUERY_KEYS) if (typeof query[key] === 'string' && query[key]) params.set(key, (query[key] as string).slice(0, 80));
  return { site: site(), ...((await (await get(`/api/items?${params}`)).json()) as object) };
}

export async function communityItem(id: unknown) {
  return (await get(`/api/items/${itemId(id)}`)).json();
}

export async function communityPreview(id: unknown) {
  const res = await get(`/api/items/${itemId(id)}/preview`);
  const type = res.headers.get('content-type') ?? '';
  if (type !== 'image/png' && type !== 'image/webp') throw new Error('미리보기 이미지가 아니에요.');
  return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: type };
}

/** Saves a flow, replacing an earlier copy of the same community item. */
export function saveFlow(flow: FlowPack, source: SavedFlow['source'], itemId?: string): SavedFlow {
  const saved: SavedFlow = { id: `flow_${randomUUID().slice(0, 8)}`, source, ...(itemId ? { itemId } : {}), flow, savedAt: new Date().toISOString() };
  store.mutate((s) => {
    const kept = s.flows.filter((f) => !(itemId && f.itemId === itemId));
    if (kept.length >= MAX_FLOWS) throw new Error(`저장한 흐름은 ${MAX_FLOWS}개까지예요. 안 쓰는 흐름을 지워 주세요.`);
    s.flows = [...kept, saved];
  });
  store.emit('flow.saved', { payload: { name: flow.name, source } });
  return saved;
}

export function removeFlow(id: string) {
  if (!store.data.flows.some((f) => f.id === id)) throw new Error('없는 흐름이에요.');
  store.mutate((s) => {
    s.flows = s.flows.filter((f) => f.id !== id);
  });
}

/**
 * Downloads an item and installs it: a theme goes to the installed themes, a flow to the saved flows.
 * A playbook comes back as is, to be previewed and applied to an office like an imported file.
 */
export async function communityInstall(id: unknown) {
  const item = itemId(id);
  const res = await get(`/api/items/${item}/download`);
  const type = res.headers.get('x-item-type');
  const size = Number(res.headers.get('content-length') ?? 0);
  if (size > THEME_LIMITS.zipBytes) throw new Error('파일이 너무 커요.');
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > THEME_LIMITS.zipBytes) throw new Error('파일이 너무 커요.');
  if (type === 'theme') {
    const theme = importTheme(bytes);
    store.emit('theme.installed', { payload: { themeId: theme.id, name: theme.name, version: theme.themeVersion, hasCss: theme.hasCss, from: 'community' } });
    return { type, theme };
  }
  const json = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  if (type === 'flow') return { type, flow: saveFlow(parseFlowPack(json), 'community', item) };
  if (type === 'playbook') return { type, playbook: parsePlaybook(json) };
  throw new Error('알 수 없는 종류의 항목이에요.');
}
