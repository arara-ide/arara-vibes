import { describe, expect, it, vi } from 'vitest';
import { installPreparedUpdate, checkForUpdate, latestRelease, newerVersion, RELEASES_URL } from './update';

const release = (tag: string, extra: Record<string, unknown> = {}) => ({ tag_name: tag, assets: [{ name: 'SHA256SUMS' }, { name: `Arara-Vibes-${tag}.dmg` }], ...extra });

describe('newerVersion', () => {
  it.each([
    ['0.1.10001', '0.1.9999', true], ['v0.2.0', '0.1.99999', true], ['1.0.0', '0.9.9', true],
    ['0.1.0', '0.1.0', false], ['0.1.0', '0.1.1', false], ['latest', '0.1.0', false], ['0.1', '0.1.0', false], ['0.1.0', 'dev', false],
  ])('%s over %s is %s', (candidate, current, expected) => expect(newerVersion(candidate, current)).toBe(expected));
});

describe('latestRelease', () => {
  it('picks the highest stable release with checksums', () => {
    expect(latestRelease([release('v0.1.2'), release('v0.1.5'), release('v0.1.3')], '0.1.0')).toBe('v0.1.5');
  });
  it('ignores drafts, prereleases, missing checksums and older versions', () => {
    expect(latestRelease([release('v0.2.0', { draft: true }), release('v0.3.0', { prerelease: true }), { tag_name: 'v0.4.0', assets: [] }, release('v0.0.9')], '0.1.0')).toBeUndefined();
  });
  it('rejects malformed payloads', () => {
    expect(latestRelease({ message: 'rate limited' }, '0.1.0')).toBeUndefined();
    expect(latestRelease([null, { tag_name: 7 }], '0.1.0')).toBeUndefined();
  });
});

describe('checkForUpdate', () => {
  it('queries the public Arara Vibes releases on GitHub', async () => {
    const get = vi.fn(async () => new Response(JSON.stringify([release('v0.2.0')])));
    expect(await checkForUpdate('0.1.0', get as unknown as typeof fetch)).toBe('v0.2.0');
    expect(get).toHaveBeenCalledWith(RELEASES_URL, expect.objectContaining({ headers: expect.objectContaining({ 'User-Agent': 'Arara-Vibes' }) }));
  });
  it('stays quiet on HTTP or network errors', async () => {
    expect(await checkForUpdate('0.1.0', (async () => new Response('', { status: 403 })) as unknown as typeof fetch)).toBeUndefined();
    expect(await checkForUpdate('0.1.0', (async () => { throw new Error('offline'); }) as unknown as typeof fetch)).toBeUndefined();
  });
});

describe('installPreparedUpdate', () => {
  const installer = () => ({ platform: 'darwin', appRoot: '/Applications/Arara Vibes.app/Contents/MacOS/Arara Vibes', pid: 1234, installMacDmg: vi.fn(async () => '/Applications/Arara Vibes.app'), openPath: vi.fn(async () => ''), quit: vi.fn() });
  it('stages the Mac update and hands off before quitting', async () => {
    const target = installer();
    await installPreparedUpdate('/cache/update.dmg', target);
    expect(target.installMacDmg).toHaveBeenCalledWith('/cache/update.dmg', 'arara-vibes', { appRoot: target.appRoot, waitPid: 1234 });
    expect(target.openPath).not.toHaveBeenCalled(); expect(target.quit).toHaveBeenCalledOnce();
    expect(target.installMacDmg.mock.invocationCallOrder[0]).toBeLessThan(target.quit.mock.invocationCallOrder[0]);
  });
  it('preserves the current app when staging fails', async () => {
    const target = installer(); target.installMacDmg.mockRejectedValue(new Error('Signature invalid'));
    await expect(installPreparedUpdate('/cache/update.dmg', target)).rejects.toThrow('Signature invalid');
    expect(target.quit).not.toHaveBeenCalled();
  });
  it('keeps the app open when the system cannot open an installer', async () => {
    const target = installer(); target.platform = 'win32'; target.openPath.mockResolvedValue('Installer unavailable');
    await expect(installPreparedUpdate('/cache/update.exe', target)).rejects.toThrow('Installer unavailable');
    expect(target.quit).not.toHaveBeenCalled();
  });
});

it('replaces a Vibes AppImage at the original shortcut path before restarting', async () => {
  const installAppImage = vi.fn(async () => {}), quit = vi.fn(), openPath = vi.fn(async () => '');
  await installPreparedUpdate('/cache/new.AppImage', { platform: 'linux', appRoot: '/tmp/mount/arara-vibes', appImage: '/home/test/Arara Vibes.AppImage', pid: 1234, installAppImage, installMacDmg: vi.fn(), openPath, quit });
  expect(installAppImage).toHaveBeenCalledWith('/cache/new.AppImage', '/home/test/Arara Vibes.AppImage', 1234);
  expect(openPath).not.toHaveBeenCalled(); expect(quit).toHaveBeenCalledOnce();
});

it('keeps Vibes open when a Linux AppImage restart cannot be prepared', async () => {
  const quit = vi.fn();
  await expect(installPreparedUpdate('/cache/new.AppImage', { platform: 'linux', appRoot: '/tmp/mount/arara-vibes', appImage: '/home/test/Vibes.AppImage', pid: 1234, installAppImage: vi.fn(async () => { throw Error('No user manager'); }), installMacDmg: vi.fn(), openPath: vi.fn(), quit })).rejects.toThrow('No user manager');
  expect(quit).not.toHaveBeenCalled();
});
