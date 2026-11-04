import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Module from 'node:module';
import { createVscodeShim } from './vscode';
import { Configuration } from './configuration';
import { jsonStore } from './jsonStore';
import { ExtensionContext } from './context';
import { Memento } from './memento';
import { Secrets } from './secrets';
import { Uri } from './uri';

describe('arara-ai activation under shim', () => {
  it('activates and registers arara.chatView provider', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vibes-act-'));
    const config = new Configuration(jsonStore(join(dir, 'c.json')), {
      'arara.apiUrl': 'http://localhost:3000',
    });
    const vscode = createVscodeShim(config, dir);

    const origLoad = (Module as unknown as { _load: (req: string, parent: unknown, isMain: boolean) => unknown })._load;
    (Module as unknown as { _load: (req: string, parent: unknown, isMain: boolean) => unknown })._load = function (req: string, parent: unknown, isMain: boolean) {
      if (req === 'vscode') return vscode;
      return origLoad.apply(this, [req, parent, isMain]);
    };

    try {
      const require = createRequire(import.meta.url);
      const ext = require('../../../arara-ai/dist/extension.js') as {
        activate: (ctx: unknown) => Promise<void>;
      };

      const storageDir = join(dir, 'storage');
      const extDir = join(dir, 'ext');
      const context = new ExtensionContext(
        Uri.file(extDir),
        Uri.file(join(storageDir, 'global')),
        Uri.file(join(storageDir, 'logs')),
        Uri.file(join(storageDir, 'workspace')),
        new Memento(jsonStore(join(storageDir, 'wsState.json'))),
        new Memento(jsonStore(join(storageDir, 'globalState.json'))),
        new Secrets(jsonStore(join(storageDir, 'secrets.json'))),
        {
          id: 'arara.arara-ai',
          packageJSON: {
            name: 'arara-ai',
            version: '0.0.1',
            araraEnvironment: 'production',
          },
        },
      );

      await ext.activate(context);

      expect(vscode.window.providers.has('arara.chatView')).toBe(true);
      const view = vscode.window.resolveView('arara.chatView');
      expect(view).toBeDefined();
      expect(view.webview.html).toContain('Arara');
      expect(view.webview.html).toContain('chat.js');
    } finally {
      (Module as unknown as { _load: (req: string, parent: unknown, isMain: boolean) => unknown })._load = origLoad;
    }
  });
});
