import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const source = process.env.ARARA_CODE_SOURCE || resolve(root, '../arara-code');
const { packageMsix } = require(resolve(source, 'scripts/package-msix.cjs'));
const { version, build } = require('../package.json');

export const storeOptions = {
  product: { nameLong: build.productName, nameShort: build.productName },
  applicationId: 'AraraVibes',
  artifactName: 'AraraVibes',
  assetDir: resolve(root, 'build/msix'),
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${packageMsix(resolve(root, 'release/win-unpacked'), resolve(root, 'release'), version, process.env, storeOptions)}\n`);
}
