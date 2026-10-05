import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';

/**
 * Settings for the project site (community + plan sales). Read from the environment; a `site/.env` file is
 * loaded when present. Separate from the app's own settings in server/config.ts.
 */
if (!process.env.NODE_TEST_CONTEXT && existsSync('site/.env')) process.loadEnvFile('site/.env');

const env = (name: string, fallback = '') => process.env[name]?.trim() || fallback;

export interface SiteConfig {
  port: number;
  /** Where people reach the site, used for links in mails and OAuth redirects. */
  publicUrl: string;
  /** PostgreSQL for production (e.g. Neon). Empty: an embedded PGlite database in `dataDir`. */
  databaseUrl: string;
  dataDir: string;
  /** Signs short-lived cookies (OAuth state). Set it in production so restarts do not cut sign-ins short. */
  secret: string;
  adminEmails: string[];
  google: { clientId: string; clientSecret: string } | null;
  github: { clientId: string; clientSecret: string } | null;
  mail: { provider: 'console' } | { provider: 'resend'; apiKey: string; from: string };
  /** Signs plan licenses (scripts/license-keygen.ts). Empty in development: a key is made and kept in dataDir. */
  license: { kid: string; privateKey: string } | null;
}

export function loadSiteConfig(): SiteConfig {
  const pair = (id: string, secret: string) => (env(id) && env(secret) ? { clientId: env(id), clientSecret: env(secret) } : null);
  return {
    port: Number(env('SITE_PORT', '8800')),
    publicUrl: env('SITE_PUBLIC_URL', 'http://localhost:5180').replace(/\/+$/, ''),
    databaseUrl: env('SITE_DATABASE_URL'),
    dataDir: env('SITE_DATA_DIR', 'site-data'),
    secret: env('SITE_SECRET') || randomBytes(32).toString('hex'),
    adminEmails: env('SITE_ADMIN_EMAILS')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    google: pair('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'),
    github: pair('GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'),
    mail: env('SITE_MAIL') === 'resend' ? { provider: 'resend', apiKey: env('RESEND_API_KEY'), from: env('SITE_MAIL_FROM') } : { provider: 'console' },
    license: env('SITE_LICENSE_PRIVATE_KEY') ? { kid: env('SITE_LICENSE_KID', 'site'), privateKey: env('SITE_LICENSE_PRIVATE_KEY').replace(/\\n/g, '\n') } : null,
  };
}
