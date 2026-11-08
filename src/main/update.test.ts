import { describe, expect, it, vi } from 'vitest';
import { checkForUpdate, latestRelease, newerVersion, RELEASES_URL } from './update';

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
