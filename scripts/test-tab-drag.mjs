import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '../../ac-web/node_modules/playwright');
const root = resolve(import.meta.dirname, '..');
const scratch = await mkdtemp(join(tmpdir(), 'vibes-tab-drag-'));
const streams = new Set();
const reorders = [];
let tabs = Array.from({ length: 12 }, (_, index) => ({ id: `tab-${index}`, label: `Platform ${index}`, kind: 'ai', running: false, tab: true }));
const publish = message => { for (const response of streams) response.write(`data: ${JSON.stringify(message)}\n\n`); };
const hello = () => publish({ type: 'hello', protocol: 1, host: 'vibes', surfaces: tabs, platforms: [] });
let epoch = 0;
const host = createServer(async (request, response) => {
  if (request.headers.authorization !== `Bearer ${'a'.repeat(64)}`) { response.writeHead(403).end(); return; }
  if (request.url === '/status') { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ protocol: 1, workspace: 'drag-fixture', locale: 'en', allowed: true, signedIn: true, background: true, theme: {}, logo: '' })); return; }
  if (request.url === '/events') {
    response.writeHead(200, { 'content-type': 'text/event-stream' }); response.write(': ready\n\n');
    streams.add(response); response.on('close', () => streams.delete(response)); hello(); return;
  }
  if (request.url === '/message') {
    let body = ''; for await (const chunk of request) body += chunk;
    const message = JSON.parse(body);
    if (message.type === 'open') publish({ type: 'document', surface: message.surface, epoch: ++epoch,
      html: '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src none"><script nonce="fixture"></script></head><body>Drag fixture</body></html>' });
    if (message.type === 'reorderTabs') { reorders.push(message.order); tabs = message.order.map(id => tabs.find(tab => tab.id === id)); hello(); }
    response.writeHead(204).end(); return;
  }
  response.writeHead(204).end();
});
let browser, shell, heartbeat;
try {
  await new Promise(resolve => host.listen(0, '127.0.0.1', resolve));
  await writeFile(join(scratch, 'host.json'), JSON.stringify({ protocol: 1, pid: process.pid, port: host.address().port, token: 'a'.repeat(64) }), { mode: 0o600 });
  process.env.ARARA_VIBES_HOSTS = scratch;
  const bundle = join(scratch, 'shell.cjs');
  await build({ stdin: { contents: "export { startShell } from './src/host/server';", resolveDir: root }, outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  const { startShell } = require(bundle);
  shell = await startShell(join(root, 'dist'), { locale: 'en', state: () => ({ pinned: true, expanded: true }), run: async () => {},
    preferences: async () => ({ language: 'en', animations: false, splash: false, closeAction: 'hide', shortcut: 'Alt+Space', launchAtLogin: false, showInBar: true, onboarded: true }) });
  heartbeat = setInterval(hello, 250);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 520, height: 480 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(shell.url);
  await page.locator('.browser-tab').last().waitFor();
  await page.locator('#loading[data-off=true]').waitFor({ state: 'attached' });
  const geometry = () => page.evaluate(() => {
    const strip = document.getElementById('tab-strip'), bounds = strip.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, y: (bounds.top + bounds.bottom) / 2, scroll: strip.scrollLeft, max: strip.scrollWidth - strip.clientWidth,
      tabs: [...document.querySelectorAll('.browser-tab')].map(tab => ({ id: tab.dataset.surface, left: tab.getBoundingClientRect().left, right: tab.getBoundingClientRect().right })) };
  });
  const start = id => page.evaluate(id => { window.dragTransfer = new DataTransfer(); document.querySelector(`[data-surface="${id}"]`).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: window.dragTransfer })); }, id);
  const over = (x, y) => page.evaluate(({ x, y }) => document.getElementById('tabs').dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: window.dragTransfer })), { x, y });
  const end = () => page.evaluate(() => document.querySelector('.tab-drag-source')?.dispatchEvent(new DragEvent('dragend', { bubbles: true })));
  const marker = page.locator('.tab-drop-marker');
  let view = await geometry();
  await start(view.tabs[0].id);
  await over(view.tabs[0].left + 4, view.y); assert.equal(await marker.isHidden(), true, 'left side of source is not a move');
  await over(view.tabs[0].right - 4, view.y); assert.equal(await marker.isHidden(), true, 'right side of source is not a move');
  await over(view.tabs[1].right - 4, view.y); assert.equal(await marker.isVisible(), true);
  const line = await marker.boundingBox(); assert.ok(line.x >= view.left && line.x + line.width <= view.right); assert.equal(line.width, 2);
  await over(view.right + 15, view.y); assert.equal(await marker.isHidden(), true, 'marker cannot escape the tab strip');
  const outsideScroll = (await geometry()).scroll; await page.waitForTimeout(200); assert.ok(Math.abs((await geometry()).scroll - outsideScroll) < 1);
  await over(view.tabs[1].right - 4, view.y); assert.equal(await marker.isVisible(), true);
  await page.evaluate(() => document.getElementById('tabs').dispatchEvent(new DragEvent('dragleave', { bubbles: true, relatedTarget: document.body })));
  assert.equal(await marker.isHidden(), true);
  await end(); assert.equal(reorders.length, 0);
  await page.evaluate(() => { document.getElementById('tab-strip').scrollLeft = 0; });
  view = await geometry();
  await start(view.tabs[0].id);
  await over(view.left + (view.right - view.left) * .9, view.y);
  await page.waitForTimeout(500);
  const rightPosition = (await geometry()).scroll;
  assert.ok(rightPosition >= 90 && rightPosition <= 145, `right edge scroll must be continuous at medium speed: ${rightPosition}`);
  await over((view.left + view.right) / 2, view.y); await page.waitForTimeout(60);
  const centered = (await geometry()).scroll; await page.waitForTimeout(250);
  assert.ok(Math.abs((await geometry()).scroll - centered) < 1, 'scroll stops in the center and hello does not pull the selected tab into view');
  await over(view.left + (view.right - view.left) * .1, view.y); await page.waitForTimeout(250);
  const leftPosition = (await geometry()).scroll;
  assert.ok(leftPosition < centered - 35 && leftPosition > centered - 85, 'left edge scrolls back at the same speed');
  await over(view.right + 10, view.y); const stopped = (await geometry()).scroll;
  await page.waitForTimeout(200); assert.ok(Math.abs((await geometry()).scroll - stopped) < 1);
  await page.evaluate(({ x, y }) => document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: window.dragTransfer })), { x: view.right + 10, y: view.y });
  assert.equal(reorders.length, 0, 'dropping outside never reorders'); assert.equal(await marker.isHidden(), true);
  await page.evaluate(() => { document.getElementById('tab-strip').scrollLeft = 0; });
  view = await geometry();
  await start(view.tabs[0].id); await over(view.tabs[1].right - 4, view.y);
  await page.evaluate(({ x, y }) => document.getElementById('tabs').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: window.dragTransfer })), { x: view.tabs[1].right - 4, y: view.y });
  await page.waitForFunction(() => document.querySelector('.browser-tab')?.dataset.surface === 'tab-1');
  assert.equal(reorders.length, 1); assert.deepEqual(reorders[0].slice(0, 3), ['tab-1', 'tab-0', 'tab-2']);
  assert.equal(await marker.isHidden(), true);
  await page.evaluate(() => { document.getElementById('tab-strip').scrollLeft = 0; });
  view = await geometry();
  await page.mouse.move((view.tabs[0].left + view.tabs[0].right) / 2, view.y);
  await page.mouse.down(); await page.mouse.move(view.tabs[0].right + 15, view.y, { steps: 6 });
  await page.mouse.move(view.right - 12, view.y, { steps: 8 });
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.tab-drag-source').count(), 1, 'the real mouse gesture starts the original drag handler');
  const nativePosition = (await geometry()).scroll;
  assert.ok(nativePosition >= 90 && nativePosition <= 145, `real mouse drag uses the same medium speed: ${nativePosition}`);
  await page.mouse.move((view.left + view.right) / 2, view.y, { steps: 8 }); await page.waitForTimeout(60);
  const nativeCentered = (await geometry()).scroll; await page.waitForTimeout(200);
  assert.ok(Math.abs((await geometry()).scroll - nativeCentered) < 1, 'real mouse stops scrolling in the center');
  await page.mouse.move(view.right - 12, view.y, { steps: 8 }); await page.waitForTimeout(250);
  assert.ok((await geometry()).scroll > nativeCentered + 35);
  await page.mouse.move(view.right + 20, view.y, { steps: 4 }); await page.waitForTimeout(60);
  assert.equal(await marker.isHidden(), true);
  const nativeOutside = (await geometry()).scroll; await page.waitForTimeout(200);
  assert.ok(Math.abs((await geometry()).scroll - nativeOutside) < 1, 'real mouse stops scrolling outside');
  await page.mouse.move(view.right - 12, view.y, { steps: 4 }); await page.waitForTimeout(250);
  await page.keyboard.press('Escape'); await page.mouse.up();
  assert.equal(await marker.isHidden(), true); assert.equal(await page.locator('.tab-drag-preview').count(), 0);
  const cancelled = (await geometry()).scroll; await page.waitForTimeout(200); const afterCancel = (await geometry()).scroll; assert.ok(Math.abs(afterCancel - cancelled) < 1, `Escape must stop scrolling: ${cancelled} to ${afterCancel}, selection ${await page.locator('[aria-selected=true]').getAttribute('id')}`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: original shell in Chromium, own-position and outside markers hidden, clipped 2px destination, continuous 20% edge scrolling, center/outside/Escape stop, real mouse drag, hello stability and valid reorder');
} finally {
  clearInterval(heartbeat); await browser?.close(); shell?.close(); for (const response of streams) response.end(); host.closeAllConnections(); await new Promise(resolve => host.close(resolve)); await rm(scratch, { recursive: true, force: true });
}
