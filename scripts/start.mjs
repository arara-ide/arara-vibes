import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchArguments, stageProductionExtension } from './launch.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const code = resolve(root, '../arara-code');
const ai = resolve(root, '../arara-ai');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
if (existsSync(join(code, '.work/vscodium/vscode/.build/electron')) && existsSync(join(ai, 'dist/extension.js'))) {
  env.ARARA_AI_EXTENSION_PATH = await stageProductionExtension(ai, join(homedir(), '.arara/vibes/runtime/production/arara-ai'), join(code, 'scripts/apply-environment.cjs'));
}
const electron = createRequire(import.meta.url)('electron');
const child = spawn(electron, launchArguments(root, process.argv.slice(2)), { env, stdio: 'inherit' });
child.on('error', error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
