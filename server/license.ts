import { randomBytes } from 'node:crypto';
import { INSTALL_ID, type LicensePayload } from '../shared/license.ts';
import { config } from './config.ts';
import { loadKv, saveKv } from './db.ts';
import { verifyLicense } from './license-crypto.ts';
import { OFFICIAL_LICENSE_KEYS } from './license-keys.ts';

/**
 * This install's side of plan licenses: its install id, the license it holds, and talking to the site.
 * The install only ever calls the site (never the other way), so it works without a public address.
 */

let install: string | null = null;

/** A random id made once per install and kept; licenses are bound to it. */
export function installId(): string {
  if (install) return install;
  const saved = loadKv<string>('install-id');
  install = typeof saved === 'string' && INSTALL_ID.test(saved) ? saved : `ins_${randomBytes(18).toString('base64url')}`;
  if (install !== saved) saveKv('install-id', install);
  return install;
}

export function trustedKeys(): Record<string, string> {
  let extra: Record<string, string> = {};
  if (config.licensePublicKeys) {
    try {
      extra = JSON.parse(config.licensePublicKeys) as Record<string, string>;
    } catch {
      console.warn('LICENSE_PUBLIC_KEYS is not valid JSON; ignored');
    }
  }
  return { ...OFFICIAL_LICENSE_KEYS, ...extra };
}

/** The payload of a license for this install; throws if it is forged, unknown or for another install. */
export function readLicense(token: string): LicensePayload {
  const payload = verifyLicense(token, trustedKeys());
  if (payload.install !== installId()) throw new Error('다른 설치용 라이선스예요. 사이트의 내 계정에서 이 설치로 옮겨 주세요.');
  return payload;
}

export const savedLicense = () => loadKv<string>('license');
export const saveLicense = (token: string) => saveKv('license', token);

export type RefreshResult = { token: string } | { gone: string };

/** Asks the site for a fresh token. `gone` means the site refuses this license (moved or removed); errors mean the site was not reached. */
export async function refreshFromSite(token: string, fetchImpl: typeof fetch = fetch): Promise<RefreshResult> {
  if (!config.siteUrl) throw new Error('SITE_URL이 설정되지 않았어요.');
  const res = await fetchImpl(`${config.siteUrl}/v1/licenses/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, install: installId() }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (res.ok && data.token) return { token: data.token };
  if (res.status === 404 || res.status === 409 || res.status === 410) return { gone: data.error ?? '사이트가 이 라이선스를 받지 않아요.' };
  throw new Error(data.error ?? `사이트 응답 오류 (${res.status})`);
}
