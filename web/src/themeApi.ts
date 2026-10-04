import type { ThemeSummary } from '../../shared/theme-pack.ts';

async function send<T>(method: string, url: string, body?: BodyInit, type?: string): Promise<T> {
  const res = await fetch(url, { method, body, headers: type ? { 'content-type': type } : undefined });
  if (res.status === 401) location.assign('/login');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `요청 실패 (${res.status})`);
  return data as T;
}

export const themeApi = {
  list: () => send<ThemeSummary[]>('GET', '/api/themes'),
  /** Installs a theme package; replaces an installed theme with the same id. Owner only. */
  importZip: (file: Blob) => send<ThemeSummary>('POST', '/api/themes/import', file, 'application/zip'),
  remove: (id: string) => send<{ ok: true }>('DELETE', `/api/themes/${encodeURIComponent(id)}`),
  exportUrl: (id: string) => `/api/themes/${encodeURIComponent(id)}/export`,
  previewUrl: (id: string, path: string) => `/themes/${encodeURIComponent(id)}/${path.split('/').map(encodeURIComponent).join('/')}`,
};
