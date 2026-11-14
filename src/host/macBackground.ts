import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { BackgroundOptions } from './background';

const execute = promisify(execFile);
export const BACKGROUND_BUNDLE_ID = 'br.app.code.arara.vibes.host';

export async function prepareMacBackgroundRuntime(options: BackgroundOptions, cache: string, platform = process.platform): Promise<BackgroundOptions> {
  if (platform !== 'darwin') return options;
  const original = await realpath(options.executable);
  const source = resolve(original, '../../..');
  if (!source.endsWith('.app')) return options;
  const plist = join(source, 'Contents/Info.plist');
  const info = await stat(original);
  const identity = createHash('sha256').update(source).update(await readFile(plist)).update(`${info.size}:${info.mtimeMs}`).digest('hex');
  const directory = join(cache, identity);
  const bundle = join(directory, 'Arara Vibes Host.app');
  const executable = join(bundle, 'Contents/MacOS', basename(original));
  const marker = join(directory, 'identity');
  const prepared = async () => (await readFile(marker, 'utf8').catch(() => '')) === identity && (await stat(executable).catch(() => undefined))?.isFile();
  if (!await prepared()) {
    await mkdir(cache, { recursive: true, mode: 0o700 });
    const stage = await mkdtemp(join(cache, '.prepare-'));
    try {
      const stagedBundle = join(stage, 'Arara Vibes Host.app');
      try { await execute('/bin/cp', ['-cR', source, stagedBundle], { timeout: 120000 }); }
      catch { await execute('/usr/bin/ditto', [source, stagedBundle], { timeout: 120000 }); }
      const stagedPlist = join(stagedBundle, 'Contents/Info.plist');
      for (const [key, value] of [['CFBundleIdentifier', BACKGROUND_BUNDLE_ID], ['CFBundleDisplayName', 'Arara Vibes Host']]) await execute('/usr/bin/plutil', ['-replace', key, '-string', value, stagedPlist]);
      await execute('/usr/bin/plutil', ['-replace', 'LSUIElement', '-bool', 'true', stagedPlist]);
      await execute('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', stagedBundle], { timeout: 120000, maxBuffer: 4_000_000 });
      await execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', stagedBundle], { timeout: 30000 });
      await writeFile(join(stage, 'identity'), identity, { mode: 0o600 });
      try { await rename(stage, directory); }
      catch (error) { if (!await prepared()) throw error; }
    } finally { await rm(stage, { recursive: true, force: true }); }
  }
  return { ...options, executable, editorExecutable: options.editorExecutable ?? options.executable };
}
