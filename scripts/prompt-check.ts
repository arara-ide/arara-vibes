import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { app, BrowserWindow } from 'electron';
import { setLocale } from '../src/i18n';
import { macBlockedPrompt, macUpdatePrompt } from '../src/main/macUpdatePrompt';
import { showNativePrompt, type NativePrompt } from '../src/main/nativePrompt';

const run = promisify(execFile);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const events = (command: string) => run('/usr/bin/osascript', ['-e', `tell application "System Events" to tell (first process whose unix id is ${process.pid}) to ${command}`]);
async function sheetText() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try { return (await events('get value of static texts of sheet 1 of window 1')).stdout.trim(); } catch { await sleep(100); }
  }
  throw new Error('The native sheet did not open');
}
async function answer(window: BrowserWindow, prompt: NativePrompt, button: number) {
  const pending = showNativePrompt(window, prompt);
  const text = await sheetText();
  for (const part of [prompt.message, ...prompt.detail.split('\n\n')]) assert.ok(text.includes(part), `Sheet text misses: ${part}\n${text}`);
  await events(`click button ${JSON.stringify(prompt.buttons[button])} of sheet 1 of window 1`);
  return pending;
}

app.setPath('userData', process.argv[3]);
void app.whenReady().then(async () => {
  assert.equal(process.platform, 'darwin', 'Run the native prompt check on macOS');
  const window = new BrowserWindow({ width: 400, height: 480, frame: false, transparent: true, alwaysOnTop: true, acceptFirstMouse: true, show: true });
  try {
    await window.loadURL('data:text/html,<body style="background:transparent"></body>');
    app.focus({ steal: true });
    const plan = [{ product: 'arara-code', version: '1.135.07656' }, { product: 'arara-vibes', version: 'v0.1.17628' }] as const;
    for (const locale of ['en', 'pt', 'es']) {
      setLocale(locale);
      assert.equal(await answer(window, macUpdatePrompt([...plan], false), 1), false, `${locale}: Cancel must decline`);
      assert.equal(await answer(window, macUpdatePrompt([plan[0]], true), 0), true, `${locale}: Continue must confirm`);
      for (const product of ['arara-code', 'arara-vibes'] as const) assert.equal(await answer(window, macBlockedPrompt(product), 0), true, `${locale}: blocked ${product} installation must offer Finder`);
    }
    process.stdout.write('PASS: native macOS update sheets show complete en/pt/es messages and return Cancel, Continue and Open installer in Finder\n');
  } finally { window.destroy(); }
  app.quit();
}).catch(error => { process.stderr.write(`${error.stack}\n`); app.exit(1); });
