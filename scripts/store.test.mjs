import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { storeOptions } from './package-msix.mjs';

const require = createRequire(import.meta.url);
const source = process.env.ARARA_CODE_SOURCE || resolve('../arara-code');
const { manifest } = require(resolve(source, 'scripts/package-msix.cjs'));
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');

test('Vibes packages with the original Code MSIX provider and its own identity and logo', () => {
  const xml = manifest({ ...storeOptions, identityName: 'AraraCode.AraraVibes', publisher: 'CN=test', publisherDisplayName: 'Arara Code', version: '0.1.1.0' });
  assert.match(xml, /Id="AraraVibes" Executable="Arara Vibes.exe"/);
  assert.doesNotMatch(xml, /windows.protocol|undefined/);
  for (const [name, size] of [['StoreLogo', 50], ['Square44x44Logo', 44], ['Square150x150Logo', 150]]) {
    const image = readFileSync(resolve(storeOptions.assetDir, `${name}.png`));
    assert.equal(image.readUInt32BE(16), size);
    assert.equal(image.readUInt32BE(20), size);
  }
});

test('only main publishes to Store after the Windows release using the Code credentials and command', () => {
  const workflow = read('../.github/workflows/release.yml');
  const job = workflow.slice(workflow.indexOf('  store-windows:'), workflow.indexOf('  release-macos-x64:'));
  assert.match(job, /if: github.ref == 'refs\/heads\/main' && vars.MSSTORE_PACKAGE_NAME != '' && vars.MSSTORE_PRODUCT_ID != ''/);
  assert.match(job, /needs: \[version, windows, release-windows\]/);
  for (const name of ['TENANT_ID', 'SELLER_ID', 'CLIENT_ID', 'CLIENT_SECRET']) assert.ok(job.includes(`secrets.MSSTORE_${name}`));
  assert.match(job, /microsoft\/microsoft-store-apppublisher@v1.4/);
  assert.match(job, /msstore publish "store\/AraraVibes-x64-\$env:RELEASE_VERSION.msix"/);
  const build = read('../.github/workflows/build-platform.yml');
  assert.match(build, /inputs.platform == 'windows' && github.ref == 'refs\/heads\/main' && vars.MSSTORE_PACKAGE_NAME != ''/);
  assert.match(build, /node scripts\/package-msix.mjs/);
  assert.match(build, /test-windows-msix.ps1/);
  assert.match(build, /path: release\/AraraVibes-x64-\$\{\{ inputs.version \}\}.msix/);
});
