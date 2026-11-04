import { spawn } from 'node:child_process';
import type { Uri } from './uri';

export class Env {
  appRoot = process.cwd();
  language = 'pt-BR';
  remoteName = undefined;

  private clipboardContent = '';

  readonly clipboard = {
    readText: async () => this.clipboardContent,
    writeText: async (text: string) => {
      this.clipboardContent = text;
    },
  };

  async openExternal(uri: Uri): Promise<boolean> {
    const url = uri.toString();
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }
}
