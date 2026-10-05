import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Account } from '../site/server/auth.ts';
import { Community, ITEM_TYPES, type ItemType } from '../site/server/community.ts';
import { loadSiteConfig } from '../site/server/config.ts';
import { migrate, openDb } from '../site/server/db.ts';
import { diskStorage, filesDir } from '../site/server/storage.ts';

/**
 * Puts a file in the community gallery as an account, through the same checks as an upload — for the official
 * items (the illustrated office theme) on a fresh site. With PGlite, stop the site server first.
 *
 *   node --experimental-strip-types scripts/site-seed.ts --email doc.corax@gmail.com --handle avataragent \
 *     --tags 일러스트,공식 art/build/illust-office.zip
 */

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const email = option('email')?.toLowerCase();
const handle = option('handle');
const tags = option('tags') ?? '';
const license = option('license');
const typeArg = option('type');
const file = args[0];
if (!email || !file) {
  console.error('usage: site-seed.ts --email <account email> [--handle name] [--type theme|flow|playbook] [--tags a,b] [--license X] <file>');
  process.exit(1);
}
const type = (typeArg ?? (file.endsWith('.zip') ? 'theme' : file.includes('playbook') ? 'playbook' : 'flow')) as ItemType;
if (!ITEM_TYPES.includes(type)) throw new Error(`unknown type ${type}`);

const config = loadSiteConfig();
const db = await openDb({ databaseUrl: config.databaseUrl, dataDir: config.dataDir });
await migrate(db);

let [account] = await db.query<Account>('SELECT * FROM accounts WHERE email = $1', [email]);
if (!account) {
  const id = `acc_${randomBytes(12).toString('base64url')}`;
  const role = config.adminEmails.includes(email) ? 'admin' : 'user';
  await db.query('INSERT INTO accounts (id, email, name, role) VALUES ($1, $2, $3, $4)', [id, email, handle ?? email.split('@')[0], role]);
  [account] = await db.query<Account>('SELECT * FROM accounts WHERE id = $1', [id]);
}
if (handle) {
  await db.query('INSERT INTO profiles (account_id, handle) VALUES ($1, $2) ON CONFLICT (account_id) DO UPDATE SET handle = EXCLUDED.handle', [account.id, handle]);
} else {
  await db.query('INSERT INTO profiles (account_id, handle) VALUES ($1, $2) ON CONFLICT DO NOTHING', [account.id, email.split('@')[0].replace(/[^a-z0-9-]/g, '-')]);
}

const community = new Community(db, diskStorage(filesDir(config.dataDir)));
const result = await community.upload(account, { type, bytes: new Uint8Array(readFileSync(file)), tags, license });
console.log(`[seed] ${type} ${result.id} v${result.label} by ${email}${result.warnings.length ? `\n  warnings: ${result.warnings.join('; ')}` : ''}`);
await db.close();
