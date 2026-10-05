import { createSiteApp } from './app.ts';
import { loadSiteConfig } from './config.ts';
import { migrate, openDb } from './db.ts';
import { mailerFor } from './mail.ts';

const config = loadSiteConfig();
const db = await openDb({ databaseUrl: config.databaseUrl, dataDir: config.dataDir });
const applied = await migrate(db);
if (applied.length) console.log(`[site] migrations applied: ${applied.join(', ')}`);

const app = createSiteApp({ db, config, mailer: mailerFor(config) });
const server = app.listen(config.port, () => {
  console.log(`[site] http://localhost:${config.port}  public=${config.publicUrl}  db=${config.databaseUrl ? 'postgres' : `pglite:${config.dataDir}`}`);
  console.log(`[site] sign-in: email${config.google ? ', google' : ''}${config.github ? ', github' : ''}  mail=${config.mail.provider}`);
  if (!config.license) {
    // A development key: let a local app trust it with LICENSE_PUBLIC_KEYS.
    const { kid, pem } = app.billing.publicKey;
    console.log(`[site] dev license key. For a local app .env:\nLICENSE_PUBLIC_KEYS=${JSON.stringify({ [kid]: pem })}`);
  }
});

const tick = () => app.billing.tick().catch((error) => console.error('[site] billing tick failed', error));
const timer = setInterval(tick, 60 * 60 * 1000);
void tick();

const stop = async () => {
  clearInterval(timer);
  server.close();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
