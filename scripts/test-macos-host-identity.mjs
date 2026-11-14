import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { appendFile, cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

assert.equal(process.platform, 'darwin', 'This fixture requires macOS');
const execute = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const source = process.env.ARARA_VIBES_SOURCE ?? resolve(root, '../arara-code/.work/vscodium/vscode');
const original = join(source, '.build/electron/Arara Code.app');
const scratch = await mkdtemp('/tmp/vibes-native-identity-');
const regular = join(scratch, 'Code Fixture.app');
const home = join(scratch, 'home');
const workspace = join(scratch, 'workspace');
const env = { ...process.env, HOME: home, USERPROFILE: home, VSCODE_DEV: '1', ARARA_DISABLE_COMPANION_DOWNLOAD: '1' };
for (const key of Object.keys(env)) if ((key.startsWith('VSCODE_') && key !== 'VSCODE_DEV') || key.startsWith('ARARA_VIBES_') || ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS'].includes(key)) delete env[key];
let host;
let foreground;
let passed = false;
const read = name => readFile(join(scratch, `${name}.json`), 'utf8').then(JSON.parse).catch(() => undefined);
const until = async (predicate, message) => {
  const deadline = Date.now() + 45000;
  while (!await predicate()) { assert.ok(Date.now() < deadline, message); await new Promise(resolve => setTimeout(resolve, 100)); }
};
try {
  await Promise.all([mkdir(home), mkdir(workspace)]);
  await cp(original, regular, { recursive: true, mode: constants.COPYFILE_FICLONE, verbatimSymlinks: true });
  const plist = join(regular, 'Contents/Info.plist');
  const identity = `br.app.code.arara.fixture.${process.pid}`;
  await execute('/usr/bin/plutil', ['-replace', 'CFBundleIdentifier', '-string', identity, plist]);
  await execute('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', regular], { timeout: 120000 });
  const module = join(scratch, 'background.cjs');
  await build({ stdin: { contents: "export { backgroundArguments } from './src/host/background'; export { prepareMacBackgroundRuntime, BACKGROUND_BUNDLE_ID } from './src/host/macBackground';", resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: module, logLevel: 'silent' });
  const { backgroundArguments, prepareMacBackgroundRuntime, BACKGROUND_BUNDLE_ID } = createRequire(import.meta.url)(module);
  const probe = async name => {
    const file = join(scratch, `${name}.cjs`);
    await writeFile(file, `const {app}=require('electron');const fs=require('node:fs');const windows=[];const save=()=>fs.writeFileSync(${JSON.stringify(join(scratch, `${name}.json`))},JSON.stringify({pid:process.pid,dock:app.dock.isVisible(),windows}));app.on('browser-window-created',(_event,window)=>{const record={visible:window.isVisible(),focused:window.isFocused()};windows.push(record);save();window.on('show',()=>{record.visible=true;save()});window.on('focus',()=>{record.focused=true;save()})});require(${JSON.stringify(join(source, 'out/main.js'))});`);
    return file;
  };
  const hiddenEntry = await probe('hidden');
  const editorEntry = await probe('editor');
  const executable = join(regular, 'Contents/MacOS/Arara Code');
  const args = ['--disable-extensions', '--use-mock-keychain', '--password-store=basic', `--extensions-dir=${join(scratch, 'extensions')}`, '--no-sandbox'];
  const options = { executable, args: [hiddenEntry, ...args], editorArgs: [editorEntry, workspace, ...args, `--user-data-dir=${join(scratch, 'editor-profile')}`], root: workspace, profile: join(scratch, 'hidden-profile'), development: true, noSandbox: true };
  const prepared = await prepareMacBackgroundRuntime(options, join(scratch, 'cache'));
  const preparedPlist = resolve(prepared.executable, '../../Info.plist');
  assert.equal((await execute('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', preparedPlist])).stdout.trim(), BACKGROUND_BUNDLE_ID);
  assert.equal((await execute('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', plist])).stdout.trim(), identity);
  assert.notEqual(prepared.executable, executable);
  host = spawn(prepared.executable, backgroundArguments(prepared), { env, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [host.stdout, host.stderr]) stream.on('data', data => { void appendFile(join(scratch, 'host.log'), data).catch(() => undefined); });
  await until(async () => (await read('hidden'))?.windows.length, 'Hidden native Code must start');
  await execute('/usr/bin/open', ['-a', regular, '--env', 'VSCODE_DEV=1', '--env', `HOME=${home}`, '--stdout', join(scratch, 'editor-out.log'), '--stderr', join(scratch, 'editor-error.log'), '--args', editorEntry, workspace, ...args, `--user-data-dir=${join(scratch, 'editor-profile')}`], { env });
  await until(async () => (await read('editor'))?.windows.some(window => window.visible), 'Opening Code through macOS must show the editor');
  foreground = (await read('editor')).pid;
  const hidden = await read('hidden');
  assert.notEqual(foreground, hidden.pid);
  assert.equal(hidden.dock, false);
  assert.ok(hidden.windows.every(window => !window.visible && !window.focused));
  assert.equal((await prepareMacBackgroundRuntime(options, join(scratch, 'cache'))).executable, prepared.executable);
  passed = true;
  console.log('PASS: native macOS opens an independent visible Code through LaunchServices while the isolated Vibes host stays hidden; source identity, signature and cached runtime preserved');
} finally {
  foreground ??= (await read('editor'))?.pid;
  if (foreground) try { process.kill(foreground); } catch {}
  if (host && host.exitCode === null && host.signalCode === null) await new Promise(resolve => {
    const timer = setTimeout(() => host.kill('SIGKILL'), 2000);
    host.once('exit', () => { clearTimeout(timer); resolve(); }); host.kill();
  });
  if (passed) await rm(scratch, { recursive: true, force: true });
  else console.log(`Artifacts: ${scratch}`);
}
