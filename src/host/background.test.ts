import { describe, expect, it } from 'vitest';
import { backgroundArguments, configuredLocale } from './background';

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

it('recognizes only a live previous host recorded for the Vibes profile', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { previousHost } = await import('./background');
  const file = join(mkdtempSync(join(tmpdir(), 'vibes-pid-')), 'vibes-host.pid');
  expect(previousHost(file, () => true)).toBeUndefined();
  writeFileSync(file, '4242');
  expect(previousHost(file, pid => pid === 4242)).toBe(4242);
  expect(previousHost(file, () => false)).toBeUndefined();
  writeFileSync(file, String(process.pid));
  expect(previousHost(file, () => true)).toBeUndefined();
  writeFileSync(file, 'garbage');
  expect(previousHost(file, () => true)).toBeUndefined();
});
