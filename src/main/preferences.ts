import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export type Language = 'system' | 'en' | 'pt' | 'es';
export interface Preferences { language: Language; animations: boolean; splash: boolean; closeAction: 'background' | 'quit'; shortcut: string; launchAtLogin: boolean; showInBar: boolean; onboarded: boolean }
export const defaultPreferences: Preferences = { language: 'system', animations: true, splash: true, closeAction: 'background', shortcut: defaultShortcut(), launchAtLogin: false, showInBar: true, onboarded: false };
const languages: Language[] = ['system', 'en', 'pt', 'es'];

export function defaultShortcut(platform = process.platform) { return platform === 'darwin' ? 'Alt+Space' : 'Control+Shift+Space'; }
const KEY = /^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Tab|Enter|Up|Down|Left|Right|Home|End|PageUp|PageDown|Insert|Delete|Backspace|Escape|[`\-=\[\];',./\\])$/;
export function validShortcut(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 60) return false;
  const parts = value.split('+');
  const key = parts.pop()!;
  const modifiers = new Set(parts);
  return modifiers.size === parts.length && parts.length > 0 && parts.every(part => ['CommandOrControl', 'Control', 'Command', 'Alt', 'Shift', 'Super'].includes(part)) && KEY.test(key);
}
export function normalizePreferences(input: unknown, base: Preferences = defaultPreferences): Preferences {
  const value = input && typeof input === 'object' ? input as Partial<Record<keyof Preferences, unknown>> : {};
  const flag = (key: 'animations' | 'splash' | 'launchAtLogin' | 'showInBar' | 'onboarded') => typeof value[key] === 'boolean' ? value[key] as boolean : base[key];
  return {
    language: languages.includes(value.language as Language) ? value.language as Language : base.language,
    closeAction: value.closeAction === 'quit' || value.closeAction === 'background' ? value.closeAction : base.closeAction,
    shortcut: validShortcut(value.shortcut) ? value.shortcut : base.shortcut,
    animations: flag('animations'), splash: flag('splash'), launchAtLogin: flag('launchAtLogin'), showInBar: flag('showInBar'), onboarded: flag('onboarded'),
  };
}
export function loadPreferences(file: string): Preferences {
  try { return normalizePreferences(JSON.parse(readFileSync(file, 'utf8'))); } catch { return { ...defaultPreferences }; }
}
export function savePreferences(file: string, preferences: Preferences) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(preferences, null, 2), { mode: 0o600 });
}
export function resolveLanguage(language: Language, system: string) {
  return language === 'system' ? system : language;
}

const quote = (value: string) => `"${value.replace(/(["`$\\])/g, '\\$1')}"`;
export function autostartEntry(command: string[]) {
  return `[Desktop Entry]\nType=Application\nVersion=1.0\nName=Arara Vibes\nExec=${command.map(quote).join(' ')}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`;
}
export const autostartFile = (environment: NodeJS.ProcessEnv = process.env) => join(environment.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'autostart', 'arara-vibes.desktop');
export function setLinuxAutostart(enabled: boolean, command: string[], file = autostartFile()) {
  if (!enabled) { rmSync(file, { force: true }); return; }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, autostartEntry(command));
}
export const linuxAutostartEnabled = (file = autostartFile()) => existsSync(file);

export function loginCommand(executable: string, appPath?: string): string[] {
  return [executable, ...(appPath ? [appPath] : []), '--hidden'];
}
const xml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
export const macAutostartFile = (home = homedir()) => join(home, 'Library/LaunchAgents/br.app.code.arara.vibes.plist');
export function macAutostartEntry(command: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>br.app.code.arara.vibes</string><key>ProgramArguments</key><array>${command.map(argument => `<string>${xml(argument)}</string>`).join('')}</array><key>RunAtLoad</key><true/><key>LimitLoadToSessionType</key><string>Aqua</string></dict></plist>
`;
}
export function setMacAutostart(enabled: boolean, command: string[], file = macAutostartFile()) {
  if (!enabled) { rmSync(file, { force: true }); return; }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, macAutostartEntry(command), { mode: 0o600 });
}
