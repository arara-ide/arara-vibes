import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const source = process.env.ARARA_VIBES_SOURCE ?? resolve(root, '../arara-code/.work/vscodium/vscode');
const executable = process.env.ARARA_ELECTRON_PATH ?? join(source, '.build/electron', process.platform === 'darwin' ? 'Arara Code.app/Contents/MacOS/Arara Code' : process.platform === 'win32' ? 'Arara Code.exe' : 'arara-code');
const scratch = mkdtempSync(join(tmpdir(), 'vibes-lifecycle-'));
const home = join(scratch, 'home');
const workspace = join(scratch, 'workspace');
const appProfile = join(scratch, 'vibes');
for (const directory of [home, workspace, appProfile]) mkdirSync(directory, { recursive: true });
writeFileSync(join(appProfile, 'preferences.json'), JSON.stringify({ onboarded: true, launchAtLogin: false, showInBar: false }));
const base = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: join(home, 'config'), XDG_CONFIG_HOME: join(home, 'config'), XDG_CACHE_HOME: join(home, 'cache'), XDG_DATA_HOME: join(home, 'data'), ARARA_DISABLE_COMPANION_DOWNLOAD: '1', ARARA_VIBES_DISABLE_UPDATES: '1', VSCODE_DEV: '1' };
for (const key of ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'VSCODE_PORTABLE', 'VSCODE_IPC_HOOK_CLI', 'ARARA_VIBES_BACKGROUND', 'ARARA_CODE_EXECUTABLE', 'ARARA_CODE_ARGS', 'ARARA_AI_EXTENSION_PATH']) delete base[key];
const probe = name => {
  const entry = join(scratch, `${name}.cjs`);
  writeFileSync(entry, `const {app}=require('electron');const fs=require('node:fs');const records=[];const save=()=>fs.writeFileSync(${JSON.stringify(join(scratch, `${name}.json`))},JSON.stringify({pid:process.pid,windows:records}));app.on('browser-window-created',(_event,window)=>{const record={visible:window.isVisible(),focused:window.isFocused()};records.push(record);save();window.on('show',()=>{record.visible=true;save()});window.on('focus',()=>{record.focused=true;save()})});require(${JSON.stringify(join(source, 'out/main.js'))});`);
  return entry;
};
const backgroundEntry = probe('background');
const editorEntry = probe('editor');
const quit = join(scratch, 'quit');
const harness = join(scratch, 'vibes.cjs');
writeFileSync(harness, `const {app}=require('electron');const fs=require('node:fs');app.setPath('userData',${JSON.stringify(appProfile)});const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(quit)})){clearInterval(timer);app.quit();setImmediate(()=>app.quit())}},50);require(${JSON.stringify(join(root, 'dist/main.cjs'))});`);
const args = ['--disable-extensions', `--extensions-dir=${join(scratch, 'extensions')}`];
const env = { ...base, ARARA_CODE_EXECUTABLE: executable, ARARA_CODE_ARGS: JSON.stringify([backgroundEntry, ...args]), ARARA_CODE_DEVELOPMENT: '1', ARARA_VIBES_ROOT: workspace, ARARA_VIBES_PROFILE: join(scratch, 'host-profile'), ARARA_VIBES_HOSTS: join(scratch, 'hosts') };
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const wait = async (predicate, message, timeout = 30000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(message);
};
const state = name => { try { return JSON.parse(readFileSync(join(scratch, `${name}.json`), 'utf8')); } catch { return undefined; } };
let vibes, editor;
try {
  assert.ok(existsSync(executable), 'Native Arara Code runtime is required');
  vibes = spawn(require('electron'), [harness, '--hidden'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  for (const stream of [vibes.stdout, vibes.stderr]) stream.on('data', chunk => { output += chunk; });
  await wait(() => { if (vibes.exitCode !== null) throw new Error(output); return state('background')?.windows.length; }, 'Vibes did not start its native host');
  assert.ok(state('background').windows.every(window => !window.visible && !window.focused));
  const backgroundPid = state('background').pid;
  editor = spawn(executable, [editorEntry, workspace, '--new-window', '--no-sandbox', '--skip-welcome', '--skip-release-notes', ...args, `--user-data-dir=${join(scratch, 'editor-profile')}`], { env: base, stdio: 'ignore' });
  await wait(() => state('editor')?.windows.some(window => window.visible), 'Arara Code could not open beside Vibes');
  assert.notEqual(state('editor').pid, backgroundPid);
  assert.ok(state('background').windows.every(window => !window.visible && !window.focused));
  writeFileSync(quit, '');
  await wait(() => vibes.exitCode !== null, 'Vibes did not finish quitting');
  assert.equal(vibes.exitCode, 0, output);
  await wait(() => !alive(backgroundPid), 'Vibes left its native host alive after quit');
  assert.ok(alive(state('editor').pid), 'Quitting Vibes stopped the independent editor');
  const next = spawn(executable, [editorEntry, '--new-window', '--no-sandbox', ...args, `--user-data-dir=${join(scratch, 'editor-profile')}`], { env: base, stdio: 'ignore' });
  await wait(() => state('editor')?.windows.filter(window => window.visible).length >= 2, 'A new Arara Code window could not open after Vibes quit');
  if (next.exitCode === null) next.kill();
  process.stdout.write('PASS: hidden Vibes host, independent editor, repeated quit without orphan host, and new editor window after quit\n');
} catch (error) {
  process.stderr.write(`Diagnostics: ${scratch}\n`);
  throw error;
} finally {
  if (vibes && vibes.exitCode === null) vibes.kill();
  if (editor && editor.exitCode === null) editor.kill();
  const background = state('background');
  if (background && alive(background.pid)) process.kill(background.pid);
}
