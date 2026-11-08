import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export interface BackgroundOptions { executable: string; args?: string[]; root?: string; profile?: string; extension?: string; hosts?: string; development?: boolean; sessionFile?: string; noSandbox?: boolean; locale?: string }
export function configuredLocale(input: string): string | undefined {
  try {
    const json = input.replace(/"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, value => value.startsWith('"') ? value : '').replace(/,\s*([}\]])/g, '$1');
    const value = JSON.parse(json).locale;
    return typeof value === 'string' && /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i.test(value) ? value : undefined;
  } catch { return; }
}
export function codeLocale(): string | undefined {
  try { return configuredLocale(readFileSync(join(process.env.VSCODE_PORTABLE ?? join(homedir(), '.arara-code'), 'argv.json'), 'utf8')); } catch { return; }
}
export function backgroundArguments(options: BackgroundOptions): string[] {
  const environment = { ARARA_VIBES_BACKGROUND: '1', ...(options.locale ? { ARARA_VIBES_LOCALE: options.locale } : {}), ...(options.sessionFile ? { ARARA_VIBES_SESSION_FILE: options.sessionFile } : {}), ...(options.hosts ? { ARARA_VIBES_HOSTS: options.hosts } : {}) };
  return [...(options.args ?? []), options.root ?? homedir(), '--new-window', '--background-window', ...(options.noSandbox ? ['--no-sandbox'] : []), '--skip-welcome', '--skip-release-notes',
    ...(options.locale ? [`--locale=${options.locale}`] : []),
    '--disable-workspace-trust', '--disable-extension=arara.arara-orchestra', '--disable-extension=arara.arara-bot',
    `--extensionEnvironment=${JSON.stringify(environment)}`,
    ...(options.profile ? [`--user-data-dir=${options.profile}`] : []),
    ...(options.extension ? [`--extensionDevelopmentPath=${options.extension}`] : []),
  ];
}
export function backgroundRuntime(directory: string, installed?: string, noSandbox = false, fallbackLocale?: string): BackgroundOptions | undefined {
  const locale = codeLocale() ?? fallbackLocale;
  if (process.env.ARARA_CODE_EXECUTABLE) return { noSandbox, executable: process.env.ARARA_CODE_EXECUTABLE, args: process.env.ARARA_CODE_ARGS ? JSON.parse(process.env.ARARA_CODE_ARGS) as string[] : undefined, development: process.env.ARARA_CODE_DEVELOPMENT === '1', root: process.env.ARARA_VIBES_ROOT, profile: process.env.ARARA_VIBES_PROFILE, hosts: process.env.ARARA_VIBES_HOSTS, sessionFile: process.env.ARARA_VIBES_SESSION_FILE };
  const workspace = resolve(directory, '../..');
  const source = join(workspace, 'arara-code/.work/vscodium/vscode');
  const electron = join(source, '.build/electron', process.platform === 'darwin' ? 'Arara Code.app/Contents/MacOS/Arara Code' : process.platform === 'win32' ? 'Arara Code.exe' : 'arara-code');
  if (existsSync(electron) && existsSync(join(workspace, 'arara-ai/dist/extension.js'))) {
    return { noSandbox, locale, executable: electron, args: [source], extension: process.env.ARARA_AI_EXTENSION_PATH ?? join(workspace, 'arara-ai'), development: true,
      sessionFile: process.env.ARARA_VIBES_SESSION_FILE ?? (process.env.ARARA_VIBES_PROFILE ? undefined : join(process.platform === 'darwin' ? join(homedir(), 'Library/Application Support') : process.platform === 'win32' ? process.env.APPDATA ?? homedir() : process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'Arara Code/User/arara-session.json')),
      profile: process.env.ARARA_VIBES_PROFILE ?? join(homedir(), '.arara/vibes/profile'), root: process.env.ARARA_VIBES_ROOT, hosts: process.env.ARARA_VIBES_HOSTS };
  }
  if (!installed) return;
  try {
    const location = realpathSync(installed);
    const products = process.platform === 'darwin' ? [join(location, 'Contents/Resources/app/product.json')] : [join(dirname(location), 'resources/app/product.json'), join(dirname(location), '../resources/app/product.json')];
    if (!products.some(product => { try { return JSON.parse(readFileSync(product, 'utf8')).companionHostVersion === 1; } catch { return false; } })) return;
  } catch { return; }
  return { noSandbox, locale, executable: process.platform === 'darwin' ? join(installed, 'Contents/MacOS/Arara Code') : installed };
}
export function previousHost(file: string, alive: (pid: number) => boolean): number | undefined {
  try {
    const pid = Number(readFileSync(file, 'utf8').trim());
    return Number.isSafeInteger(pid) && pid > 1 && pid !== process.pid && alive(pid) ? pid : undefined;
  } catch { return; }
}
const isAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
export class BackgroundHost {
  private child?: ChildProcess;
  private starting?: Promise<void>;
  constructor(private readonly options: BackgroundOptions, private readonly pidFile = join(options.profile ?? join(homedir(), '.arara/vibes/profile'), 'vibes-host.pid')) {}
  start(): Promise<void> {
    if (this.child && this.child.exitCode === null) {
      try { this.child.kill(); } catch { }
      this.child = undefined;
    }
    const stale = previousHost(this.pidFile, isAlive);
    if (stale) try { process.kill(stale); } catch { }
    return this.starting ??= new Promise<void>((resolve, reject) => {
      const env: NodeJS.ProcessEnv = { ...process.env, ARARA_VIBES_BACKGROUND: '1', ARARA_DISABLE_COMPANION_DOWNLOAD: '1', ...(this.options.development ? { VSCODE_DEV: '1' } : {}) };
      delete env.ELECTRON_RUN_AS_NODE;
      this.child = spawn(this.options.executable, backgroundArguments(this.options), { env, detached: true, stdio: 'ignore', windowsHide: true });
      this.child.once('error', error => { this.child = undefined; reject(error); });
      this.child.once('spawn', () => {
        try { mkdirSync(dirname(this.pidFile), { recursive: true, mode: 0o700 }); writeFileSync(this.pidFile, String(this.child?.pid ?? ''), { mode: 0o600 }); } catch { }
        this.child?.unref(); resolve();
      });
    }).finally(() => { this.starting = undefined; });
  }
}
