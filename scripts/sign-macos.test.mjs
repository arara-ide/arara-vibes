import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

test('mac packaging uses the shared signer and fails without the persistent identity', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(manifest.build.mac.sign, 'scripts/sign-macos.cjs');
  const signer = require('./sign-macos.cjs').default;
  await assert.rejects(signer({ app: '/missing.app' }));
});

test('release imports signing secrets and cleans the temporary keychain', () => {
  const workflow = readFileSync(new URL('../.github/workflows/build-platform.yml', import.meta.url), 'utf8');
  assert.match(workflow, /secrets.ARARA_MACOS_SIGN_P12_BASE64/);
  assert.match(workflow, /secrets.ARARA_MACOS_SIGN_PASSWORD/);
  assert.match(workflow, /import-macos-signing.sh/);
  assert.match(workflow, /security delete-keychain/);
});

test('each platform publishes on its own without waiting for the others', () => {
  const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  for (const platform of ['linux', 'windows', 'macos-x64', 'macos-arm64']) {
    assert.match(workflow, new RegExp(`release-${platform}:\\n    if: github.ref == 'refs/heads/main'\\n    needs: \\[version, ${platform}\\]`));
  }
  assert.doesNotMatch(workflow, /needs: \[version, build\]/);
});
