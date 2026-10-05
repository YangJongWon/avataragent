import { isPlan, type Plan } from './plans.ts';

/**
 * Plan licenses sold on the project site. The site signs a payload with Ed25519; a self-hosted install checks
 * the signature with the site's public key and applies the plan. Token: base64url(JSON payload) "." base64url(sig).
 * This file only describes and validates the payload, so browsers can import it; signing lives in
 * server/license-crypto.ts.
 */

export type LicenseStatus = 'active' | 'past_due' | 'canceled';

export interface LicensePayload {
  v: 1;
  /** Which site key signed it, so keys can be rotated. */
  kid: string;
  /** License id; the install uses it as its subscription id. */
  lic: string;
  account: string;
  plan: Plan;
  seats: number;
  /** The one install this license is bound to. */
  install: string;
  periodEnd: string;
  issuedAt: string;
  status: LicenseStatus;
}

export const INSTALL_ID = /^ins_[A-Za-z0-9_-]{16,40}$/;
export const LICENSE_ID = /^lic_[A-Za-z0-9_-]{8,40}$/;
const KID = /^[a-z0-9-]{1,32}$/;
const STATUSES: LicenseStatus[] = ['active', 'past_due', 'canceled'];

const isDate = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));

/** Strict check of a decoded payload; throws on anything unexpected. */
export function parseLicensePayload(input: unknown): LicensePayload {
  const p = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const fail = (what: string): never => {
    throw new Error(`라이선스 형식이 올바르지 않아요 (${what}).`);
  };
  if (p.v !== 1) fail('version');
  if (typeof p.kid !== 'string' || !KID.test(p.kid)) fail('kid');
  if (typeof p.lic !== 'string' || !LICENSE_ID.test(p.lic)) fail('lic');
  if (typeof p.account !== 'string' || !p.account || p.account.length > 60) fail('account');
  if (!isPlan(p.plan) || p.plan === 'personal') fail('plan');
  if (typeof p.seats !== 'number' || !Number.isInteger(p.seats) || p.seats < 0 || p.seats > 10_000) fail('seats');
  if (typeof p.install !== 'string' || !INSTALL_ID.test(p.install)) fail('install');
  if (!isDate(p.periodEnd)) fail('periodEnd');
  if (!isDate(p.issuedAt)) fail('issuedAt');
  if (!STATUSES.includes(p.status as LicenseStatus)) fail('status');
  return {
    v: 1,
    kid: p.kid as string,
    lic: p.lic as string,
    account: p.account as string,
    plan: p.plan as Plan,
    seats: p.seats as number,
    install: p.install as string,
    periodEnd: p.periodEnd as string,
    issuedAt: p.issuedAt as string,
    status: p.status as LicenseStatus,
  };
}
