import { mkdir, readFile, readlink, symlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

export function launchArguments(root, input) {
  return ['--no-sandbox', root, '--production', ...input.filter(argument => !['--no-sandbox', '--production'].includes(argument))];
}

export async function stageProductionExtension(source, destination, applyEnvironment) {
  const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  await mkdir(destination, { recursive: true, mode: 0o700 });
  await writeFile(join(destination, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  const { readdir } = await import('node:fs/promises');
  const files = ['dist', 'media', 'themes', ...(await readdir(source)).filter(file => /^package\.nls(?:\.[\w-]+)?\.json$/.test(file))];
  for (const file of files) {
    const target = join(source, file);
    const link = join(destination, file);
    try { await symlink(target, link, ['dist', 'media', 'themes'].includes(file) ? 'junction' : 'file'); }
    catch (error) {
      if (error.code !== 'EEXIST' || await readlink(link) !== target) throw error;
    }
  }
  await promisify(execFile)(process.execPath, [applyEnvironment, 'production', join(destination, 'package.json')], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  return destination;
}
