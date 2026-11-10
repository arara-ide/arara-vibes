import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const scratch = mkdtempSync(join(tmpdir(), 'vibes-shell-check-'));
const entry = join(scratch, 'check.cjs');
await build({ entryPoints: [join(root, process.argv.includes('--updates') ? 'scripts/updates-check.ts' : 'scripts/shell-check.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: entry, external: ['electron'], logLevel: 'silent' });
const env = { ...process.env, ARARA_VIBES_HOSTS: join(scratch, 'hosts') };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(createRequire(import.meta.url)('electron'), [entry, join(root, 'dist'), scratch], { env, stdio: 'inherit' });
const timer = setTimeout(() => { child.kill(); process.exitCode = 1; }, 30000);
child.on('error', error => { clearTimeout(timer); process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
child.on('exit', code => { clearTimeout(timer); process.exitCode = code ?? 1; });
