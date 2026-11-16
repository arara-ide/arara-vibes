import { expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codeInstallation } from './installation';

vi.mock('node:fs', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs')>();
  return { ...original, realpathSync: vi.fn(original.realpathSync) };
});

it('reads the installed Mac bundle version without executing the editor', () => {
  const root = mkdtempSync(join(tmpdir(), 'vibes-code-installation-'));
  try {
    const bundle = join(root, 'AraraCode.app'); const app = join(bundle, 'Contents/Resources/app');
    mkdirSync(app, { recursive: true }); writeFileSync(join(app, 'product.json'), JSON.stringify({ version: '1.135.07400', companionHostVersion: 1 }));
    expect(codeInstallation(bundle, 'darwin')).toMatchObject({ appRoot: realpathSync(app), format: 'dmg', product: { version: '1.135.07400' } });
    writeFileSync(join(app, 'product.json'), JSON.stringify({ version: '1.135.07430', companionHostVersion: 1 }));
    expect(codeInstallation(bundle, 'darwin')?.product.version).toBe('1.135.07430');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('does not invent a version for missing or corrupt installations', () => {
  expect(codeInstallation(undefined)).toBeUndefined();
  expect(codeInstallation('/missing/Arara Code.app', 'darwin')).toBeUndefined();
});

it('preserves portable Windows downloads and the installed setup format', () => {
  const root = mkdtempSync(join(tmpdir(), 'vibes-code-windows-'));
  try {
    const executable = join(root, 'Arara Code.exe'); const app = join(root, 'resources/app');
    mkdirSync(app, { recursive: true }); writeFileSync(executable, 'fixture');
    writeFileSync(join(app, 'product.json'), JSON.stringify({ version: '1.135.07400' }));
    expect(codeInstallation(executable, 'win32')?.format).toBe('zip');
    writeFileSync(join(app, 'product.json'), JSON.stringify({ version: '1.135.07400', target: 'system' }));
    expect(codeInstallation(executable, 'win32')?.format).toBe('exe');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('reads Windows Store metadata when canonicalizing its protected parent is forbidden', () => {
  const root = mkdtempSync(join(tmpdir(), 'vibes-code-store-'));
  const executable = join(root, 'Arara Code.exe');
  const app = join(root, 'resources/app');
  mkdirSync(app, { recursive: true });
  writeFileSync(executable, 'fixture');
  writeFileSync(join(app, 'product.json'), JSON.stringify({ version: '1.135.07681', companionHostVersion: 1 }));
  const canonicalize = vi.mocked(realpathSync).mockClear().mockImplementation(() => { throw Object.assign(new Error('Access denied'), { code: 'EPERM' }); });
  try {
    expect(codeInstallation(executable, 'win32')).toMatchObject({ location: executable, product: { companionHostVersion: 1, version: '1.135.07681' } });
    expect(canonicalize).not.toHaveBeenCalled();
    expect(codeInstallation(join(root, 'missing.exe'), 'win32')).toBeUndefined();
  } finally { canonicalize.mockRestore(); rmSync(root, { recursive: true, force: true }); }
});
