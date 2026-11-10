import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

interface CodeProduct { version?: string; companionHostVersion?: number; applicationName?: string; araraInstallFormat?: string; target?: string }
export function codeInstallation(installed: string | undefined, platform = process.platform) {
  if (!installed) return;
  try {
    const location = realpathSync(installed);
    const candidates = platform === 'darwin' ? [join(location, 'Contents/Resources/app/product.json')] : [join(dirname(location), 'resources/app/product.json'), join(dirname(location), '../resources/app/product.json')];
    for (const file of candidates) {
      let product: CodeProduct;
      try { product = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
      const format = platform === 'darwin' ? 'dmg' : platform === 'win32' ? product.target === 'system' || product.target === 'user' ? 'exe' : 'zip' : product.araraInstallFormat === 'appimage' ? 'AppImage' : file.startsWith('/usr/share/arara-code/') && existsSync('/var/lib/dpkg/info/arara-code.list') ? 'deb' : 'tar.gz';
      return { location, appRoot: dirname(file), product, format };
    }
  } catch { return; }
}
