import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function packageArguments(input, platform = process.platform) {
  const target = input.some(value => ['--linux', '-l'].includes(value)) ? 'linux'
    : input.some(value => ['--mac', '--macos', '-m', '--win', '--windows', '-w'].includes(value)) ? 'other' : platform;
  return ['--publish', 'never', ...input, ...(target === 'linux' ? ['--config', 'scripts/linux-builder.cjs'] : [])];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const require = createRequire(import.meta.url);
  const child = spawn(process.execPath, [require.resolve('electron-builder/out/cli/cli.js'), ...packageArguments(process.argv.slice(2))], { stdio: 'inherit' });
  child.on('error', error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}
