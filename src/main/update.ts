export const RELEASES_URL = 'https://api.github.com/repos/arara-ide/arara-vibes/releases?per_page=30';
export const CHECK_INTERVAL_MS = 5 * 60_000;
const pattern = /^v?(\d+)\.(\d+)\.(\d+)$/;

export function newerVersion(candidate: string, current: string) {
  const a = pattern.exec(candidate), b = pattern.exec(current);
  if (!a || !b) return false;
  for (let i = 1; i <= 3; i++) if (Number(a[i]) !== Number(b[i])) return Number(a[i]) > Number(b[i]);
  return false;
}

export const validVersion = (value: unknown): value is string => typeof value === 'string' && pattern.test(value);
export const isCurrentVersion = (latest: string, current: unknown) => validVersion(current) && !newerVersion(latest, current);

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

interface UpdateInstaller {
  platform: string;
  appRoot: string;
  appImage?: string;
  installAppImage?(file: string, destination: string, pid: number): Promise<void>;
  pid: number;
  installMacDmg(file: string, product: string, options: { appRoot: string; waitPid: number }): Promise<string>;
  openPath(file: string): Promise<string>;
  quit(): void;
}

export function debInstallCommand(file: string) {
  return `sudo apt install '${file.replace(/'/g, `'\\''`)}'`;
}

export async function installPreparedUpdate(file: string, installer: UpdateInstaller): Promise<string | undefined> {
  if (installer.platform === 'linux' && file.endsWith('.deb')) return debInstallCommand(file);
  if (installer.platform === 'darwin') await installer.installMacDmg(file, 'arara-vibes', { appRoot: installer.appRoot, waitPid: installer.pid });
  else if (installer.platform === 'linux' && file.endsWith('.AppImage')) {
    if (!installer.appImage || !installer.installAppImage) throw new Error('AppImage installation path unavailable');
    await installer.installAppImage(file, installer.appImage, installer.pid);
  } else {
    const error = await installer.openPath(file);
    if (error) throw new Error(error);
  }
  installer.quit();
}
