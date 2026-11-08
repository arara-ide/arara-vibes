export const RELEASES_URL = 'https://api.github.com/repos/arara-ide/arara-vibes/releases?per_page=30';
export const CHECK_INTERVAL_MS = 5 * 60_000;
const pattern = /^v?(\d+)\.(\d+)\.(\d+)$/;

export function newerVersion(candidate: string, current: string) {
  const a = pattern.exec(candidate), b = pattern.exec(current);
  if (!a || !b) return false;
  for (let i = 1; i <= 3; i++) if (Number(a[i]) !== Number(b[i])) return Number(a[i]) > Number(b[i]);
  return false;
}

interface Release { tag_name?: unknown; draft?: unknown; prerelease?: unknown; assets?: unknown }
export function latestRelease(releases: unknown, current: string): string | undefined {
  if (!Array.isArray(releases)) return;
  let latest: string | undefined;
  for (const release of releases as Release[]) {
    if (!release || release.draft || release.prerelease || typeof release.tag_name !== 'string') continue;
    const names = Array.isArray(release.assets) ? (release.assets as { name?: unknown }[]).map(asset => asset?.name) : [];
    if (!names.includes('SHA256SUMS')) continue;
    if (newerVersion(release.tag_name, latest ?? current)) latest = release.tag_name;
  }
  return latest;
}

export async function checkForUpdate(current: string, get: typeof fetch = fetch) {
  try {
    const response = await get(RELEASES_URL, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Arara-Vibes' }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return;
    return latestRelease(await response.json(), current);
  } catch { return; }
}
