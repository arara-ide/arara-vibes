import { afterEach, expect, it, vi } from 'vitest';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const state = vi.hoisted(() => ({ failure: false, cloneFailure: false, calls: [] as { executable: string; args: string[] }[] }));
vi.mock('node:child_process', async () => ({ execFile: (executable: string, args: string[], options: unknown, callback?: (error: Error | null, stdout?: string) => void) => {
  state.calls.push({ executable, args });
  const done = typeof options === 'function' ? options as typeof callback : callback;
  if (executable === '/bin/cp' && state.cloneFailure) { done!(new Error('Clone unavailable')); return; }
  if (executable === '/bin/cp' || executable === '/usr/bin/ditto') {
    const offset = executable === '/bin/cp' ? 1 : 0;
    void cp(args[offset], args[offset + 1], { recursive: true }).then(() => done!(null, ''), error => done!(error)); return;
  }
  done!(state.failure && executable.endsWith('codesign') ? new Error('Signing failed') : null, '');
} }));

import { BACKGROUND_BUNDLE_ID, prepareMacBackgroundRuntime } from './macBackground';
afterEach(() => { state.calls.length = 0; state.failure = false; state.cloneFailure = false; });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'vibes-background-identity-'));
  const source = join(root, 'Original Code.app');
  const executable = join(source, 'Contents/MacOS/Code');
  await mkdir(join(source, 'Contents/MacOS'), { recursive: true });
  await writeFile(executable, 'original binary');
  await writeFile(join(source, 'Contents/Info.plist'), 'original identity');
  return { root, source, executable, cache: join(root, 'cache') };
}

it('prepares and caches an independent Mac identity while preserving the original editor and arguments', async () => {
  const f = await fixture();
  try {
    const options = { executable: f.executable, args: ['/entry'], profile: '/isolated', development: true };
    const prepared = await prepareMacBackgroundRuntime(options, f.cache, 'darwin');
    expect(prepared.executable).not.toBe(f.executable);
    expect(prepared.editorExecutable).toBe(f.executable);
    expect(prepared.args).toEqual(options.args);
    expect(prepared.profile).toBe('/isolated');
    expect(await readFile(prepared.executable, 'utf8')).toBe('original binary');
    expect(await readFile(join(f.source, 'Contents/Info.plist'), 'utf8')).toBe('original identity');
    expect(state.calls.some(call => call.args.includes(BACKGROUND_BUNDLE_ID))).toBe(true);
    expect(state.calls.some(call => call.args.includes('CFBundleName'))).toBe(false);
    expect(state.calls.some(call => call.args.includes('--verify'))).toBe(true);
    const calls = state.calls.length;
    expect(await prepareMacBackgroundRuntime(options, f.cache, 'darwin')).toEqual(prepared);
    expect(state.calls).toHaveLength(calls);
    await writeFile(f.executable, 'updated binary');
    const updated = await prepareMacBackgroundRuntime(options, f.cache, 'darwin');
    expect(updated.executable).not.toBe(prepared.executable);
    expect(await readFile(updated.executable, 'utf8')).toBe('updated binary');
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it('leaves other systems unchanged and never publishes a bundle after signing fails', async () => {
  const f = await fixture();
  try {
    const options = { executable: f.executable };
    for (const platform of ['win32', 'linux'] as const) expect(await prepareMacBackgroundRuntime(options, f.cache, platform)).toBe(options);
    expect(state.calls).toHaveLength(0);
    state.failure = true;
    await expect(prepareMacBackgroundRuntime(options, f.cache, 'darwin')).rejects.toThrow('Signing failed');
    state.failure = false;
    const prepared = await prepareMacBackgroundRuntime(options, f.cache, 'darwin');
    expect(prepared.editorExecutable).toBe(f.executable);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it('prepares the same independent app when the volume cannot clone files', async () => {
  const f = await fixture();
  try {
    state.cloneFailure = true;
    const prepared = await prepareMacBackgroundRuntime({ executable: f.executable }, f.cache, 'darwin');
    expect(await readFile(prepared.executable, 'utf8')).toBe('original binary');
    expect(state.calls.some(call => call.executable === '/usr/bin/ditto')).toBe(true);
    expect(prepared.editorExecutable).toBe(f.executable);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
