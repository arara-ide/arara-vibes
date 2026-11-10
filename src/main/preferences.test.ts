import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { autostartEntry, autostartFile, defaultPreferences, loadPreferences, normalizePreferences, resolveLanguage, savePreferences, setLinuxAutostart } from './preferences';

it('keeps animations on by default and ignores invalid values', () => {
  expect(defaultPreferences.animations).toBe(true);
  expect(defaultPreferences.splash).toBe(true);
  expect(normalizePreferences({ splash: false }).splash).toBe(false);
  expect(normalizePreferences({ language: 'fr', animations: 'no', showInBar: false })).toEqual({ ...defaultPreferences, showInBar: false });
  expect(normalizePreferences({ launchAtLogin: true }, { ...defaultPreferences, language: 'pt' })).toMatchObject({ language: 'pt', launchAtLogin: true });
});
it('persists preferences and falls back to defaults when the file is missing', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'vibes-prefs-')), 'nested', 'preferences.json');
  expect(loadPreferences(file)).toEqual(defaultPreferences);
  savePreferences(file, { ...defaultPreferences, animations: false, onboarded: true });
  expect(loadPreferences(file)).toMatchObject({ animations: false, onboarded: true });
});
it('resolves the system language only when no language was chosen', () => {
  expect(resolveLanguage('system', 'pt-BR')).toBe('pt-BR');
  expect(resolveLanguage('es', 'pt-BR')).toBe('es');
});
it('writes and removes the XDG autostart entry with a quoted command', () => {
  const base = mkdtempSync(join(tmpdir(), 'vibes-xdg-'));
  const file = autostartFile({ XDG_CONFIG_HOME: base });
  expect(file).toBe(join(base, 'autostart', 'arara-vibes.desktop'));
  setLinuxAutostart(true, ['/opt/Arara Vibes/vibes', '--hidden'], file);
  expect(readFileSync(file, 'utf8')).toBe(autostartEntry(['/opt/Arara Vibes/vibes', '--hidden']));
  expect(readFileSync(file, 'utf8')).toContain('Exec="/opt/Arara Vibes/vibes" "--hidden"');
  setLinuxAutostart(false, [], file);
  expect(existsSync(file)).toBe(false);
});

it('keeps a background close and a valid shortcut by default', async () => {
  const { defaultShortcut, validShortcut } = await import('./preferences');
  expect(defaultPreferences.closeAction).toBe('background');
  expect(defaultShortcut('darwin')).toBe('Alt+Space');
  expect(defaultShortcut('win32')).toBe('Control+Shift+Space');
  expect(defaultShortcut('linux')).toBe('Control+Shift+Space');
  expect(normalizePreferences({ closeAction: 'quit' }).closeAction).toBe('quit');
  expect(normalizePreferences({ closeAction: 'explode' }).closeAction).toBe('background');
  for (const value of ['Alt+Space', 'CommandOrControl+Shift+K', 'Control+F5', 'Super+Alt+/']) expect(validShortcut(value)).toBe(true);
  for (const value of ['Space', 'Alt+Alt+K', 'Hyper+K', 'Alt+', 'Alt+Ç', 'x'.repeat(61), 7]) expect(validShortcut(value)).toBe(false);
  expect(normalizePreferences({ shortcut: 'Shift' }).shortcut).toBe(defaultPreferences.shortcut);
});

it('registers a hidden macOS login launch with escaped arguments and removes only its own entry', async () => {
  const { loginCommand, macAutostartEntry, macAutostartFile, setMacAutostart } = await import('./preferences');
  const root = mkdtempSync(join(tmpdir(), 'vibes-login-'));
  const file = macAutostartFile(root);
  const command = loginCommand('/Applications/Arara & Vibes.app/Contents/MacOS/Arara Vibes');
  expect(command).toEqual(['/Applications/Arara & Vibes.app/Contents/MacOS/Arara Vibes', '--hidden']);
  expect(loginCommand('/electron', '/project')).toEqual(['/electron', '/project', '--hidden']);
  setMacAutostart(true, command, file);
  const entry = readFileSync(file, 'utf8');
  expect(entry).toBe(macAutostartEntry(command));
  expect(entry).toContain('Arara &amp; Vibes.app');
  expect(entry).toContain('<key>RunAtLoad</key><true/>');
  expect(entry).toContain('<string>--hidden</string>');
  expect(entry).not.toContain('KeepAlive');
  setMacAutostart(false, [], file);
  expect(existsSync(file)).toBe(false);
});
