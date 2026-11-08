import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launchArguments, stageProductionExtension } from './launch.mjs';

test('npm start defaults to production and no-sandbox and accepts both explicit flags', () => {
  assert.deepEqual(launchArguments('/app', []), ['--no-sandbox', '/app', '--production']);
  assert.deepEqual(launchArguments('/app', ['--production', '--no-sandbox', '--smoke-test']), ['--no-sandbox', '/app', '--production', '--smoke-test']);
});
test('production uses the same environment provider as dev.sh while linking the original runtime', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vibes-production-'));
  try {
    const source = join(root, 'source'); const destination = join(root, 'runtime');
    for (const folder of ['dist', 'media', 'themes']) await mkdir(join(source, folder), { recursive: true });
    const manifest = { name: 'arara-ai', publisher: 'arara', contributes: { configuration: { properties: { 'arara.apiUrl': { default: 'http://localhost:7010' }, 'arara.webUrl': { default: 'http://localhost:7210' } } } } };
    await writeFile(join(source, 'package.json'), JSON.stringify(manifest));
    const code = process.env.ARARA_CODE_SOURCE || resolve(import.meta.dirname, '../../arara-code');
    await stageProductionExtension(source, destination, join(code, 'scripts/apply-environment.cjs'));
    const staged = JSON.parse(await readFile(join(destination, 'package.json'), 'utf8'));
    assert.equal(staged.araraEnvironment, 'production');
    assert.equal(staged.contributes.configuration.properties['arara.apiUrl'].default, 'https://api.code.app.br');
    assert.equal(staged.contributes.configuration.properties['arara.webUrl'].default, 'https://arara.code.app.br');
    assert.equal(await realpath(join(destination, 'media')), await realpath(join(source, 'media')));
    assert.equal(JSON.parse(await readFile(join(source, 'package.json'), 'utf8')).araraEnvironment, undefined);
    await stageProductionExtension(source, destination, join(code, 'scripts/apply-environment.cjs'));
  } finally { await rm(root, { recursive: true }); }
});
