import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackgroundHost, backgroundArguments, backgroundRuntime, codeSessionFile, configuredLocale, installedBackgroundExecutable } from './background';

describe('background host startup', () => {
  it('starts the native host hidden, without loading sibling extensions or passing secrets', () => {
    const args = backgroundArguments({ executable: '/app', root: '/Users/test', profile: '/isolated profile', extension: '/ai', hosts: '/hosts', noSandbox: true });
    expect(args).toContain('--background-window');
    expect(args).toContain('--no-sandbox');
    expect(args).toContain('--user-data-dir=/isolated profile');
    expect(args).toContain('--disable-extension=arara.arara-bot');
    expect(args).toContain('--disable-extension=arara.arara-orchestra');
    expect(args).toContain('/Users/test');
    const environment = JSON.parse(args.find(arg => arg.startsWith('--extensionEnvironment='))!.split('=').slice(1).join('='));
    expect(environment).toEqual({ ARARA_VIBES_BACKGROUND: '1', ARARA_VIBES_HOSTS: '/hosts' });
    expect(args.join(' ')).not.toMatch(/accessToken|refreshToken|reset|force/);
  });
});

it('passes the same locale to the background host', () => {
  expect(backgroundArguments({ executable: '/app', locale: 'es-MX' })).toContain('--locale=es-MX');
});

it('reads the original runtime language without accepting commented values or malformed arguments', () => {
  expect(configuredLocale('{\n// "locale": "en",\n"locale": "pt-BR",\n}')).toBe('pt-BR');
  expect(configuredLocale('{"locale":"es-MX"}')).toBe('es-MX');
  expect(configuredLocale('{"locale":"en --inspect"}')).toBeUndefined();
  expect(configuredLocale('invalid')).toBeUndefined();
});

afterEach(() => vi.unstubAllEnvs());

it('always isolates the host profile, including installed apps and explicit executables', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = mkdtempSync(join(tmpdir(), 'vibes-runtime-'));
  const app = join(root, 'Arara Code.app');
  const product = process.platform === 'darwin' ? join(app, 'Contents/Resources/app') : join(root, 'resources/app');
  mkdirSync(product, { recursive: true });
  writeFileSync(join(product, 'product.json'), JSON.stringify({ companionHostVersion: 1, applicationName: 'arara-code' }));
  if (process.platform === 'linux') writeFileSync(join(root, 'arara-code'), '');
  if (process.platform !== 'darwin') writeFileSync(app, '');
  vi.stubEnv('ARARA_CODE_EXECUTABLE', '');
  vi.stubEnv('ARARA_VIBES_PROFILE', '');
  delete process.env.ARARA_VIBES_PROFILE;
  const options = backgroundRuntime(join(root, 'dist'), app, false, 'es');
  expect(options?.profile).toMatch(/vibes[/\\]profile$/);
  expect(options?.sessionFile).toBe(codeSessionFile());
  expect(backgroundArguments(options!)).toContain(`--user-data-dir=${options!.profile}`);
  expect(backgroundArguments({ executable: '/app' })).toContain(`--user-data-dir=${options!.profile}`);
  vi.stubEnv('ARARA_CODE_EXECUTABLE', '/explicit');
  vi.stubEnv('ARARA_VIBES_PROFILE', join(root, 'isolated'));
  vi.stubEnv('ARARA_VIBES_SESSION_FILE', join(root, 'session.json'));
  expect(backgroundRuntime(root, undefined, true, 'pt')).toMatchObject({ executable: '/explicit', profile: join(root, 'isolated'), sessionFile: join(root, 'session.json'), locale: 'pt', noSandbox: true });
});

it('does not borrow the real account when a test profile is supplied', () => {
  vi.stubEnv('ARARA_CODE_EXECUTABLE', '/explicit');
  vi.stubEnv('ARARA_VIBES_PROFILE', '/isolated');
  vi.stubEnv('ARARA_VIBES_SESSION_FILE', '');
  delete process.env.ARARA_VIBES_SESSION_FILE;
  expect(backgroundRuntime('/unused')?.sessionFile).toBeUndefined();
});

it('starts once and stops only its own process, without trusting an old PID file', async () => {
  const { mkdtempSync, writeFileSync, existsSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = mkdtempSync(join(tmpdir(), 'vibes-owned-'));
  const fixture = join(root, 'host.cjs');
  const ready = join(root, 'ready.json');
  writeFileSync(join(root, 'vibes-host.pid'), String(process.pid));
  writeFileSync(fixture, `require('node:fs').writeFileSync(${JSON.stringify(ready)}, JSON.stringify({pid:process.pid, portable:process.env.VSCODE_PORTABLE, hook:process.env.VSCODE_IPC_HOOK_CLI})); setInterval(()=>{},1000);`);
  vi.stubEnv('VSCODE_PORTABLE', root);
  vi.stubEnv('VSCODE_IPC_HOOK_CLI', 'editor.sock');
  const host = new BackgroundHost({ executable: process.execPath, args: [fixture], profile: root });
  try {
    await Promise.all([host.start(), host.start()]);
    await vi.waitFor(() => expect(existsSync(ready)).toBe(true));
    const first = JSON.parse(readFileSync(ready, 'utf8'));
    expect(first.portable).toBeUndefined(); expect(first.hook).toBeUndefined();
    await host.start();
    expect(JSON.parse(readFileSync(ready, 'utf8')).pid).toBe(first.pid);
    await host.stop();
    expect(() => process.kill(first.pid, 0)).toThrow();
    expect(() => process.kill(process.pid, 0)).not.toThrow();
    await host.stop();
  } finally { await host.stop(); }
});

it('reports a spawn failure and permits another attempt', async () => {
  const host = new BackgroundHost({ executable: '/missing/arara-code' });
  await expect(host.start()).rejects.toThrow();
  await expect(host.start()).rejects.toThrow();
  await host.stop();
});

it('owns the native Linux process instead of a CLI launcher, and validates every installed runtime', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, realpathSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'vibes-native-')));
  mkdirSync(join(root, 'bin')); mkdirSync(join(root, 'resources/app'), { recursive: true });
  const launcher = join(root, 'bin/arara-code');
  const native = join(root, 'arara-code');
  writeFileSync(launcher, ''); writeFileSync(native, '');
  const product = join(root, 'resources/app/product.json');
  writeFileSync(product, JSON.stringify({ companionHostVersion: 1, applicationName: 'arara-code' }));
  expect(installedBackgroundExecutable(launcher, 'linux')).toBe(native);
  expect(installedBackgroundExecutable(native, 'win32')).toBe(native);
  writeFileSync(product, JSON.stringify({ companionHostVersion: 0, applicationName: 'arara-code' }));
  expect(installedBackgroundExecutable(launcher, 'linux')).toBeUndefined();
  writeFileSync(product, JSON.stringify({ companionHostVersion: 1, applicationName: '../other' }));
  expect(installedBackgroundExecutable(launcher, 'linux')).toBeUndefined();
});
