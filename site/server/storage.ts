import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

/**
 * Where uploaded files live. Local disk for development and small installs; an S3-compatible bucket
 * (Cloudflare R2) goes behind the same interface for the cloud.
 */
export interface FileStorage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

const KEY = /^[a-z0-9_-]+(\/[A-Za-z0-9_.-]+)*$/;

export function diskStorage(dir: string): FileStorage {
  const base = resolve(dir);
  const pathOf = (key: string) => {
    const path = resolve(base, key);
    if (!KEY.test(key) || key.includes('..') || !path.startsWith(base + sep)) throw new Error(`bad storage key: ${key}`);
    return path;
  };
  return {
    async put(key, bytes) {
      const path = pathOf(key);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes);
    },
    async get(key) {
      const path = pathOf(key);
      return existsSync(path) ? new Uint8Array(readFileSync(path)) : null;
    },
    async delete(key) {
      rmSync(pathOf(key), { force: true });
    },
  };
}

/** Kept in memory: tests. */
export function memoryStorage(): FileStorage {
  const files = new Map<string, Uint8Array>();
  return {
    put: async (key, bytes) => void files.set(key, bytes),
    get: async (key) => files.get(key) ?? null,
    delete: async (key) => void files.delete(key),
  };
}

export const filesDir = (dataDir: string) => join(dataDir || 'site-data', 'files');
