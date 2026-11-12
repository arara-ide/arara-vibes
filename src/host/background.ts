import { codeInstallation } from './installation';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { stageProductionExtension } from '../../scripts/launch.mjs';

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
export const backgroundProfile = () => process.env.ARARA_VIBES_PROFILE ?? join(homedir(), '.arara/vibes/profile');
export function codeSessionFile(): string {
  const base = process.env.VSCODE_PORTABLE ? join(process.env.VSCODE_PORTABLE, 'user-data') : join(process.platform === 'darwin' ? join(homedir(), 'Library/Application Support') : process.platform === 'win32' ? process.env.APPDATA ?? homedir() : process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'Arara Code');
  return join(base, 'User/arara-session.json');
}
export function backgroundArguments(options: BackgroundOptions): string[] {
  const environment = { ARARA_VIBES_BACKGROUND: '1', ...(options.locale ? { ARARA_VIBES_LOCALE: options.locale } : {}), ...(options.sessionFile ? { ARARA_VIBES_SESSION_FILE: options.sessionFile } : {}), ...(options.hosts ? { ARARA_VIBES_HOSTS: options.hosts } : {}) };
  return [...(options.args ?? []), options.root ?? homedir(), '--new-window', '--background-window', ...(options.noSandbox ? ['--no-sandbox'] : []), '--skip-welcome', '--skip-release-notes',
    ...(options.locale ? [`--locale=${options.locale}`] : []),
    '--disable-workspace-trust', '--disable-extension=arara.arara-orchestra', '--disable-extension=arara.arara-bot',
    `--extensionEnvironment=${JSON.stringify(environment)}`,
    `--user-data-dir=${options.profile ?? backgroundProfile()}`,
    ...(options.extension ? [`--extensionDevelopmentPath=${options.extension}`] : []),
  ];
}
export function backgroundRuntime(directory: string, installed?: string, noSandbox = false, fallbackLocale?: string): BackgroundOptions | undefined {
  const locale = codeLocale() ?? fallbackLocale;
  const profile = backgroundProfile();
  const sessionFile = process.env.ARARA_VIBES_SESSION_FILE ?? (process.env.ARARA_VIBES_PROFILE ? undefined : codeSessionFile());
  const shared = { noSandbox, locale, profile, sessionFile, root: process.env.ARARA_VIBES_ROOT, hosts: process.env.ARARA_VIBES_HOSTS };
  if (process.env.ARARA_CODE_EXECUTABLE) return { ...shared, executable: process.env.ARARA_CODE_EXECUTABLE, args: process.env.ARARA_CODE_ARGS ? JSON.parse(process.env.ARARA_CODE_ARGS) as string[] : undefined, development: process.env.ARARA_CODE_DEVELOPMENT === '1' };
  const workspace = resolve(directory, '../..');
  const source = join(workspace, 'arara-code/.work/vscodium/vscode');
  const electron = join(source, '.build/electron', process.platform === 'darwin' ? 'Arara Code.app/Contents/MacOS/Arara Code' : process.platform === 'win32' ? 'Arara Code.exe' : 'arara-code');
  if (existsSync(electron) && existsSync(join(workspace, 'arara-ai/dist/extension.js'))) {
    return { ...shared, executable: electron, args: [source], extension: process.env.ARARA_AI_EXTENSION_PATH ?? join(workspace, 'arara-ai'), development: true };
  }
  if (!installed) return;
  const executable = installedBackgroundExecutable(installed);
  return executable ? { ...shared, executable } : undefined;
}
export async function prepareBackgroundRuntime(options: BackgroundOptions, destination = join(homedir(), '.arara/vibes/runtime/production/arara-ai'), provider = options.extension ? resolve(options.extension, '../arara-code/scripts/apply-environment.cjs') : ''): Promise<BackgroundOptions> {
  if (!options.development || !options.extension || process.env.ARARA_AI_EXTENSION_PATH) return options;
  return { ...options, extension: await stageProductionExtension(options.extension, destination, provider) };
}
export function installedBackgroundExecutable(installed: string, platform = process.platform): string | undefined {
  const installation = codeInstallation(installed, platform);
  if (!installation || installation.product.companionHostVersion !== 1) return;
  const { location, product, appRoot } = installation;
  if (platform === 'darwin') return join(location, 'Contents/MacOS/Arara Code');
  if (platform === 'win32') return location;
  if (product.applicationName && /^[\w.-]+$/.test(product.applicationName)) {
    const binary = resolve(appRoot, '../..', product.applicationName);
    if (existsSync(binary)) return binary;
  }
}

export class BackgroundHost {
  private child?: ChildProcess;
  private starting?: Promise<void>;
  constructor(private readonly options: BackgroundOptions) {}
  start(): Promise<void> {
    if (this.starting) return this.starting;
    if (this.child && this.child.exitCode === null && this.child.signalCode === null) return Promise.resolve();
    this.starting = new Promise<void>((resolve, reject) => {
      const env: NodeJS.ProcessEnv = { ...process.env, ARARA_VIBES_BACKGROUND: '1', ARARA_DISABLE_COMPANION_DOWNLOAD: '1', ...(this.options.development ? { VSCODE_DEV: '1' } : {}) };
      delete env.ELECTRON_RUN_AS_NODE;
      delete env.VSCODE_PORTABLE;
      delete env.VSCODE_IPC_HOOK_CLI;
      const child = spawn(this.options.executable, backgroundArguments(this.options), { env, detached: true, stdio: 'ignore', windowsHide: true });
      this.child = child;
      child.once('error', error => { if (this.child === child) this.child = undefined; reject(error); });
      child.once('exit', () => { if (this.child === child) this.child = undefined; });
      child.once('spawn', () => { child.unref(); resolve(); });
    }).finally(() => { this.starting = undefined; });
    return this.starting;
  }
  async stop(): Promise<void> {
    await this.starting?.catch(() => undefined);
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }, 2000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      child.kill();
    });
  }
}
