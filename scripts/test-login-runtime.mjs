import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const scratch = mkdtempSync(join(tmpdir(), 'vibes-login-runtime-'));
const home = join(scratch, 'home');
const shell = join(scratch, 'arara-vibes');
const code = join(scratch, 'arara-code/.work/vscodium/vscode');
const source = join(scratch, 'arara-ai');
const profile = join(scratch, 'shell-profile');
const marker = join(scratch, 'started.json');
const preferences = join(scratch, 'preferences.cjs');
await build({ entryPoints: [join(root, 'src/main/preferences.ts')], outfile: preferences, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
const { loginCommand } = createRequire(import.meta.url)(preferences);
for (const directory of [home, shell, code, source, profile, join(scratch, 'arara-code/scripts')]) mkdirSync(directory, { recursive: true });
cpSync(process.env.ARARA_VIBES_DIST ?? join(root, 'dist'), join(shell, 'dist'), { recursive: true });
cpSync(join(root, 'package.json'), join(shell, 'package.json'));
cpSync(resolve(root, '../arara-code/scripts/apply-environment.cjs'), join(scratch, 'arara-code/scripts/apply-environment.cjs'));
for (const directory of ['dist', 'media', 'themes']) mkdirSync(join(source, directory));
writeFileSync(join(source, 'dist/extension.js'), '');
const manifest = { name: 'arara-ai', publisher: 'arara', contributes: { configuration: { properties: { 'arara.apiUrl': { default: 'http://localhost:7010' }, 'arara.webUrl': { default: 'http://localhost:7210' } } } } };
writeFileSync(join(source, 'package.json'), JSON.stringify(manifest));
writeFileSync(join(code, 'package.json'), JSON.stringify({ main: 'capture.cjs' }));
writeFileSync(join(code, 'capture.cjs'), `const fs=require('node:fs');const path=require('node:path');const argument=process.argv.find(value=>value.startsWith('--extensionDevelopmentPath='));const extension=argument.slice(argument.indexOf('=')+1);const manifest=JSON.parse(fs.readFileSync(path.join(extension,'package.json'),'utf8'));fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid,extension,environment:manifest.araraEnvironment,api:manifest.contributes.configuration.properties['arara.apiUrl'].default}));setInterval(()=>{},1000);`);
const binary = join(code, '.build/electron', process.platform === 'darwin' ? 'Arara Code.app/Contents/MacOS/Arara Code' : 'arara-code');
mkdirSync(resolve(binary, '..'), { recursive: true });
symlinkSync(process.execPath, binary);
writeFileSync(join(profile, 'preferences.json'), JSON.stringify({ onboarded: true, launchAtLogin: false, showInBar: false, splash: false }));
const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, '.config'), ARARA_VIBES_ROOT: home, ARARA_VIBES_PROFILE: join(scratch, 'host-profile'), ARARA_VIBES_HOSTS: join(scratch, 'hosts'), ARARA_DISABLE_COMPANION_DOWNLOAD: '1', ARARA_VIBES_DISABLE_UPDATES: '1' };
for (const key of ['ELECTRON_RUN_AS_NODE', 'ARARA_AI_EXTENSION_PATH', 'ARARA_CODE_EXECUTABLE', 'ARARA_CODE_ARGS', 'ARARA_CODE_DEVELOPMENT', 'ARARA_VIBES_SESSION_FILE', 'VSCODE_PORTABLE', 'VSCODE_IPC_HOOK_CLI']) delete env[key];
const [executable, ...args] = loginCommand(createRequire(import.meta.url)('electron'), shell);
const child = spawn(executable, [...args, `--user-data-dir=${profile}`], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk; });
try {
  const deadline = Date.now() + 15000;
  while (!existsSync(marker) && Date.now() < deadline && child.exitCode === null) await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(existsSync(marker), `Login did not start its host: ${output}`);
  const started = JSON.parse(readFileSync(marker, 'utf8'));
  assert.equal(started.environment, 'production', 'Login must prepare the same environment as npm start');
  assert.equal(started.api, 'https://api.code.app.br');
  assert.notEqual(started.extension, source);
  assert.deepEqual(JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')), manifest);
  process.stdout.write('PASS: direct Electron login starts a production host without npm start, inherited environment or changes to the original extension\n');
} finally {
  child.kill('SIGTERM');
  if (existsSync(marker)) { try { process.kill(JSON.parse(readFileSync(marker, 'utf8')).pid); } catch {} }
}
