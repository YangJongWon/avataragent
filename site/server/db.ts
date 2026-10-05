import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The site's database: PostgreSQL in production, PGlite (PostgreSQL compiled to WASM, in-process) in
 * development and tests. Both speak the same SQL, so migrations and queries are shared.
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs several statements at once (migrations). */
  exec(sql: string): Promise<void>;
  transaction<T>(work: (tx: Pick<Db, 'query'>) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function openDb(options: { databaseUrl?: string; dataDir?: string } = {}): Promise<Db> {
  if (options.databaseUrl) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: options.databaseUrl, max: 10 });
    return {
      query: async (sql, params) => (await pool.query(sql, params as unknown[])).rows,
      exec: async (sql) => {
        await pool.query(sql);
      },
      async transaction(work) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await work({ query: async (sql, params) => (await client.query(sql, params as unknown[])).rows });
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  // No data dir means an in-memory database (tests).
  const lite = options.dataDir ? new PGlite(options.dataDir) : new PGlite();
  return {
    query: async (sql, params) => (await lite.query(sql, params as unknown[])).rows as never,
    exec: async (sql) => {
      await lite.exec(sql);
    },
    transaction: (work) => lite.transaction((tx) => work({ query: async (sql, params) => (await tx.query(sql, params as unknown[])).rows as never })),
    close: () => lite.close(),
  };
}

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations');

/** Applies `site/migrations/*.sql` in name order, each once, each in its own transaction. */
export async function migrate(db: Db, dir = MIGRATIONS): Promise<string[]> {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const done = new Set((await db.query<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name));
  const applied: string[] = [];
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue;
    try {
      await db.exec(`BEGIN;\n${readFileSync(join(dir, name), 'utf8')}\nINSERT INTO schema_migrations (name) VALUES ('${name.replace(/'/g, "''")}');\nCOMMIT;`);
    } catch (error) {
      await db.exec('ROLLBACK').catch(() => {});
      throw new Error(`migration ${name} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    applied.push(name);
  }
  return applied;
}
