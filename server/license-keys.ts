/**
 * Public keys of the project site that every install trusts for plan licenses (kid → PEM).
 * Add the official key here when the site's production key is made (`scripts/license-keygen.ts`).
 * For a local or private site, set LICENSE_PUBLIC_KEYS in .env instead (JSON: {"kid": "PEM"}).
 */
export const OFFICIAL_LICENSE_KEYS: Record<string, string> = {};
