import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from '../config.ts';

const CANDIDATES = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
  '/usr/local/bin/soffice',
  '/opt/homebrew/bin/soffice',
  '/snap/bin/libreoffice',
];

let cached: string | null | undefined;

export function findSoffice(): string | null {
  if (cached !== undefined) return cached;
  const names = process.platform === 'win32' ? ['soffice.exe'] : ['soffice', 'libreoffice'];
  const onPath = (process.env.PATH ?? '').split(delimiter).flatMap((dir) => names.map((n) => join(dir, n)));
  cached = [config.sofficePath, ...CANDIDATES, ...onPath].find((p) => p && existsSync(p)) ?? null;
  return cached;
}

export const RENDERER_HINT =
  process.platform === 'win32'
    ? 'LibreOffice를 설치하면 켜져요: winget install TheDocumentFoundation.LibreOffice'
    : process.platform === 'darwin'
      ? 'LibreOffice를 설치하면 켜져요: brew install --cask libreoffice'
      : 'LibreOffice를 설치하면 켜져요: sudo apt install -y libreoffice-impress libreoffice-writer';

const run = (file: string, args: string[], timeout: number) =>
  new Promise<void>((resolve, reject) =>
    execFile(file, args, { timeout, windowsHide: true }, (error, _stdout, stderr) => (error ? reject(new Error(stderr?.toString().trim() || error.message)) : resolve())),
  );

/** Converts with a throwaway profile so it never fights a LibreOffice window the user has open. */
export async function toPdf(file: Buffer, ext: 'pptx' | 'docx'): Promise<Buffer> {
  const soffice = findSoffice();
  if (!soffice) throw new Error(`화면 검수에 쓸 LibreOffice를 찾지 못했어요. ${RENDERER_HINT}`);
  const dir = await mkdtemp(join(tmpdir(), 'avataragent-render-'));
  try {
    const input = join(dir, `design.${ext}`);
    await writeFile(input, file);
    const profile = pathToFileURL(join(dir, 'profile')).href;
    await run(soffice, [`-env:UserInstallation=${profile}`, '--headless', '--norestore', '--convert-to', 'pdf', '--outdir', dir, input], 120_000);
    return await readFile(join(dir, 'design.pdf'));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
