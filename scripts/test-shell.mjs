import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const scratch = mkdtempSync(join(tmpdir(), 'vibes-shell-check-'));
const entry = join(scratch, 'check.cjs');
await build({ entryPoints: [join(root, process.argv.includes('--placement') ? 'scripts/placement-check.ts' : process.argv.includes('--transport') ? 'scripts/transport-check.ts' : process.argv.includes('--updates') ? 'scripts/updates-check.ts' : 'scripts/shell-check.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: entry, external: ['electron'], logLevel: 'silent' });
const env = { ...process.env, ARARA_VIBES_HOSTS: join(scratch, 'hosts'), ARARA_DISABLE_COMPANION_DOWNLOAD: '1', ARARA_VIBES_DISABLE_UPDATES: '1' };
if (process.argv.includes('--placement')) {
  const home = join(scratch, 'home');
  mkdirSync(home);
  mkdirSync(join(scratch, 'workspace'));
  Object.assign(env, { HOME: home, USERPROFILE: home, APPDATA: join(home, 'config'), XDG_CONFIG_HOME: join(home, 'config'), XDG_CACHE_HOME: join(home, 'cache'), XDG_DATA_HOME: join(home, 'data'), ARARA_CODE_EXECUTABLE: join(scratch, 'missing-code'), ARARA_CODE_ARGS: '[]', ARARA_VIBES_ROOT: join(scratch, 'workspace'), ARARA_VIBES_PROFILE: join(scratch, 'host-profile'), ARARA_VIBES_SESSION_FILE: join(scratch, 'session.json') });
  for (const key of ['NODE_OPTIONS', 'VSCODE_PORTABLE', 'VSCODE_IPC_HOOK_CLI']) delete env[key];
}
delete env.ELECTRON_RUN_AS_NODE;
const run = extra => new Promise(resolve => {
  const child = spawn(createRequire(import.meta.url)('electron'), [entry, process.env.ARARA_VIBES_DIST || join(root, 'dist'), scratch, ...extra], { env, stdio: 'inherit' });
  const timer = setTimeout(() => child.kill(), 30000);
  child.on('error', error => { clearTimeout(timer); process.stderr.write(`${error.message}\n`); resolve(1); });
  child.on('exit', code => { clearTimeout(timer); resolve(code ?? 1); });
});
process.exitCode = await run([]);
if (process.exitCode === 0 && process.argv.includes('--placement')) process.exitCode = await run(['--restore-placement']);
