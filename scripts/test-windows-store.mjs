import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildSync } from 'esbuild';

assert.equal(process.platform, 'win32', 'Run this test on Windows with both Store products installed');
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const scratch = mkdtempSync(join(tmpdir(), 'vibes-store-'));
const home = join(scratch, 'home');
const workspace = join(scratch, 'workspace');
const hosts = join(scratch, 'hosts');
for (const directory of [home, workspace, hosts]) mkdirSync(directory, { recursive: true });
const runtime = require(join(root, 'dist/companion.cjs'));
const code = runtime.installedCompanion('arara-code');
const vibes = runtime.installedCompanion('arara-vibes');
for (const location of [code, vibes]) assert.match(location ?? '', /[\\/]WindowsApps[\\/]AraraCode\./i);
for (const key of ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'XDG_CONFIG_HOME']) process.env[key] = home;
Object.assign(process.env, { ARARA_DISABLE_COMPANION_DOWNLOAD: '1', ARARA_DESKTOP_AUTO_UPDATE: '0', ARARA_VIBES_HOSTS: hosts });
const bundle = join(scratch, 'runtime.cjs');
writeFileSync(bundle, buildSync({ stdin: { contents: "export { BackgroundHost, installedBackgroundExecutable } from './src/host/background'; export { HostConnection } from './src/host/connection';", resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text);
const { BackgroundHost, installedBackgroundExecutable, HostConnection } = require(bundle);
const executable = installedBackgroundExecutable(code);
assert.ok(executable, 'The Store Code must support the companion host');
const background = new BackgroundHost({ executable, root: workspace, profile: join(scratch, 'profile'), hosts, sessionFile: join(scratch, 'empty-session.json'), args: ['--use-inmemory-secretstorage', '--password-store=basic'] });
const connection = new HostConnection(() => {}, hosts);
try {
  await background.start();
  const deadline = Date.now() + 45000;
  let host;
  while (Date.now() < deadline && !host) {
    host = (await connection.discover()).find(item => item.allowed && item.background);
    if (!host) await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(host, 'The Store Code did not publish its Vibes host within 45 seconds');
  await connection.connect(host.id);
  console.log('PASS: both Store installations discovered and the real isolated Code host answers Vibes');
} finally {
  await connection.shutdown(); connection.disconnect(); await background.stop();
}
