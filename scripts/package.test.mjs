import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { packageArguments } from './package.mjs';

const require = createRequire(import.meta.url);
const config = require('./linux-builder.cjs');
const manifest = require('../package.json');

test('Linux launcher handles spaces, inherited Node mode and portable AppImage flags', { skip: process.platform === 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'vibes launcher '));
  try {
    const executable = join(root, 'arara-vibes');
    await writeFile(executable, '#!/bin/sh\nprintf "%s\\n" "node=${ELECTRON_RUN_AS_NODE:-unset}" "$@"\n', { mode: 0o755 });
    await require('./linux-after-pack.cjs')({ appOutDir: root });
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', APPIMAGE: '' };
    const native = spawnSync(executable, ['--smoke-test', 'argument with spaces'], { env, encoding: 'utf8' });
    assert.equal(native.status, 0, native.stderr);
    assert.equal(native.stdout, 'node=unset\n--smoke-test\nargument with spaces\n');
    await mkdir(join(root, 'bin'));
    const link = join(root, 'bin', 'arara-vibes');
    await symlink(executable, link);
    const linked = spawnSync(link, ['--smoke-test'], { env, encoding: 'utf8' });
    assert.equal(linked.status, 0, linked.stderr);
    assert.equal(linked.stdout, 'node=unset\n--smoke-test\n');
    const portable = spawnSync(executable, ['--smoke-test'], { env: { ...env, APPIMAGE: '/downloads/Arara Vibes.AppImage' }, encoding: 'utf8' });
    assert.equal(portable.status, 0, portable.stderr);
    assert.equal(portable.stdout, 'node=unset\n--no-sandbox\n--smoke-test\n');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('all Linux packaging entry points select the Linux configuration, including cross builds', () => {
  for (const [args, host] of [[[], 'linux'], [['--linux'], 'darwin'], [['-l', '--arm64'], 'win32']]) {
    assert.deepEqual(packageArguments(args, host), ['--publish', 'never', ...args, '--config', 'scripts/linux-builder.cjs']);
  }
  for (const args of [['--mac', '--arm64'], ['--win'], ['--windows']]) {
    assert.deepEqual(packageArguments(args, 'linux'), ['--publish', 'never', ...args]);
  }
  assert.deepEqual(packageArguments([], 'win32'), ['--publish', 'never']);
});

test('Linux packaging keeps branding and icons while removing spaces from the installation path', async () => {
  const { LinuxTargetHelper } = require('app-builder-lib/out/targets/LinuxTargetHelper.js');
  const { AppInfo } = require('app-builder-lib/out/appInfo.js');
  const appInfo = new AppInfo({ config, metadata: manifest }, null, config.linux);
  assert.match(appInfo.sanitizedProductName, /^[a-zA-Z0-9-]+$/);
  const helper = new LinuxTargetHelper({ appInfo, executableName: config.linux.executableName, config, platformSpecificBuildOptions: config.linux, fileAssociations: [] });
  const desktop = await helper.computeDesktopEntry(config.linux);
  assert.match(desktop, /^Name=Arara Vibes$/m);
  assert.match(desktop, /^Exec=\/opt\/AraraVibes\/arara-vibes %U$/m);
  assert.match(desktop, /^Icon=arara-vibes$/m);
  assert.equal(manifest.build.productName, 'Arara Vibes');
  assert.equal(manifest.build.win.icon, 'build/icon.png');
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
    const png = await readFile(new URL(`../${config.linux.icon}/${size}x${size}.png`, import.meta.url));
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});

test('Linux installer configures SUID regardless of installer user namespaces and refreshes launcher caches', { skip: process.platform === 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'vibes-installer-'));
  try {
    const bin = join(root, 'bin');
    const log = join(root, 'commands');
    await mkdir(bin);
    for (const name of ['chown', 'chmod', 'update-alternatives', 'update-desktop-database', 'gtk-update-icon-cache']) {
      await writeFile(join(bin, name), '#!/bin/sh\nprintf "%s\\n" "' + name + ' $*" >> "$VIBES_TEST_LOG"\n', { mode: 0o755 });
    }
    const render = async file => (await readFile(new URL(file, import.meta.url), 'utf8')).replaceAll('${sanitizedProductName}', config.productName).replaceAll('${executable}', config.linux.executableName);
    const env = { ...process.env, PATH: bin, VIBES_TEST_LOG: log };
    const install = spawnSync('/bin/sh', ['-s'], { input: await render('./linux-after-install.sh'), env, encoding: 'utf8' });
    assert.equal(install.status, 0, install.stderr);
    const commands = await readFile(log, 'utf8');
    assert.match(commands, /chown root:root \/opt\/AraraVibes\/chrome-sandbox\nchmod 4755 \/opt\/AraraVibes\/chrome-sandbox/);
    assert.match(commands, /update-alternatives --remove arara-vibes \/opt\/Arara Vibes\/arara-vibes/);
    assert.match(commands, /update-alternatives --install \/usr\/bin\/arara-vibes arara-vibes \/opt\/AraraVibes\/arara-vibes 100/);
    assert.match(commands, /gtk-update-icon-cache/);
    await writeFile(log, '');
    const removal = await render('./linux-after-remove.sh');
    assert.equal(spawnSync('/bin/sh', ['-s', '--', 'upgrade'], { input: removal, env }).status, 0);
    assert.doesNotMatch(await readFile(log, 'utf8'), /update-alternatives/);
    assert.equal(spawnSync('/bin/sh', ['-s', '--', 'remove'], { input: removal, env }).status, 0);
    assert.match(await readFile(log, 'utf8'), /update-alternatives --remove arara-vibes \/opt\/AraraVibes\/arara-vibes/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
