import assert from 'node:assert/strict';
import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

app.setPath('userData', process.argv[3]);
require(join(process.argv[2], 'main.cjs'));
void app.whenReady().then(async () => {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const window = BrowserWindow.getAllWindows()[0];
    const state = await window?.webContents.executeJavaScript(`({ signedOut: document.getElementById('signin')?.hidden === false, recovery: document.getElementById('recover')?.hidden === false })`).catch(() => undefined) as { signedOut: boolean; recovery: boolean } | undefined;
    assert.equal(state?.recovery ?? false, false, 'The real Windows startup entered recovery instead of connecting to Code');
    if (state?.signedOut) {
      process.stdout.write('PASS: real Electron shell discovered and launched installed Code, connected to its isolated host and rendered sign-in without a personal session\n');
      app.quit();
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('The Windows shell did not connect to its isolated Code host within 60 seconds');
}).catch(error => { process.stderr.write(`${error.stack}\n`); app.once('will-quit', () => app.exit(1)); app.quit(); });
