/**
 * Makes a license signing key pair for the project site.
 *
 *   node --experimental-strip-types scripts/license-keygen.ts [kid]
 *
 * Put the private key in the site's secrets (SITE_LICENSE_PRIVATE_KEY, SITE_LICENSE_KID) and never commit it.
 * Put the public key in server/license-keys.ts so every install trusts licenses from the site.
 */
import { newLicenseKeys } from '../server/license-crypto.ts';

const kid = process.argv[2] ?? `site-${new Date().toISOString().slice(0, 10)}`;
const { privateKey, publicKey } = newLicenseKeys();
console.log(`# kid: ${kid}\n`);
console.log('# site secrets (keep private):');
console.log(`SITE_LICENSE_KID=${kid}`);
console.log(`SITE_LICENSE_PRIVATE_KEY="${privateKey.trim().replace(/\n/g, '\\n')}"\n`);
console.log('# server/license-keys.ts (public):');
console.log(`  '${kid}': \`${publicKey.trim()}\`,`);
