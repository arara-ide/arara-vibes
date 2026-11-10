import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

assert.equal(process.platform, 'darwin', 'This check requires macOS launchd');
const root = resolve(import.meta.dirname, '..');
const scratch = mkdtempSync(join(tmpdir(), 'vibes-autostart-'));
const label = `br.app.code.arara.vibes.test.${process.pid}`;
const domain = `gui/${process.getuid()}`;
let loaded = false;
try {
  const bundle = join(scratch, 'preferences.cjs');
  await build({ entryPoints: [join(root, 'src/main/preferences.ts')], outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  const { loginCommand, setMacAutostart } = createRequire(import.meta.url)(bundle);
  const marker = join(scratch, 'started.json');
  const fixture = join(scratch, 'Arara & Vibes.cjs');
  writeFileSync(fixture, `require('node:fs').writeFileSync(${JSON.stringify(marker)},JSON.stringify(process.argv.slice(2)))`);
  const file = join(scratch, `${label}.plist`);
  setMacAutostart(true, loginCommand(process.execPath, fixture), file);
  writeFileSync(file, readFileSync(file, 'utf8').replace('<string>br.app.code.arara.vibes</string>', `<string>${label}</string>`));
  execFileSync('/usr/bin/plutil', ['-lint', file], { stdio: 'pipe' });
  execFileSync('/bin/launchctl', ['bootstrap', domain, file], { stdio: 'pipe' });
  loaded = true;
  const deadline = Date.now() + 10000;
  while (!existsSync(marker) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(existsSync(marker), 'launchd did not run the generated login command');
  assert.deepEqual(JSON.parse(readFileSync(marker, 'utf8')), ['--hidden']);
  execFileSync('/bin/launchctl', ['bootout', `${domain}/${label}`], { stdio: 'pipe' });
  loaded = false;
  setMacAutostart(false, [], file);
  assert.equal(existsSync(file), false);
  process.stdout.write('PASS: macOS launchd accepted the login entry, ran its escaped command with --hidden, and removed the test job\n');
} finally {
  if (loaded) execFileSync('/bin/launchctl', ['bootout', `${domain}/${label}`], { stdio: 'pipe' });
  rmSync(scratch, { recursive: true, force: true });
}
