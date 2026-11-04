import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

mkdirSync(resolve(root, 'dist'), { recursive: true });

await esbuild.build({
  entryPoints: [resolve(root, 'src/main/main.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  outfile: resolve(root, 'dist/main.cjs'),
  external: ['electron'],
  format: 'cjs',
  sourcemap: true,
});

await esbuild.build({
  entryPoints: [resolve(root, 'src/preload/preload.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  outfile: resolve(root, 'dist/preload.cjs'),
  external: ['electron'],
  format: 'cjs',
  sourcemap: true,
});

const aiMedia = resolve(root, '../arara-ai/media');
if (existsSync(aiMedia)) {
  mkdirSync(resolve(root, 'media'), { recursive: true });
  cpSync(aiMedia, resolve(root, 'media'), { recursive: true });
}

process.stdout.write('Build completed successfully.\n');
