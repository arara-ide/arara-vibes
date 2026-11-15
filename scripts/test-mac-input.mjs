import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const run = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '../../ac-web/node_modules/playwright');
assert.equal(process.platform, 'darwin', 'Run the native input check on macOS');
const scratch = mkdtempSync('/tmp/vibes-input-');
const home = join(scratch, 'home');
const profile = join(scratch, 'vibes');
for (const directory of [home, profile, join(scratch, 'workspace')]) mkdirSync(directory, { recursive: true });
writeFileSync(join(profile, 'preferences.json'), JSON.stringify({ language: 'en', onboarded: true, launchAtLogin: false, showInBar: false, animations: true, splash: true }));
const port = await new Promise(done => { const server = createServer().listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => done(port)); }); });
const harness = join(scratch, 'vibes.cjs');
writeFileSync(harness, `const {app}=require('electron');app.setPath('userData',${JSON.stringify(profile)});app.commandLine.appendSwitch('remote-debugging-port','${port}');app.commandLine.appendSwitch('remote-debugging-address','127.0.0.1');require(${JSON.stringify(join(root, 'dist/main.cjs'))});`);
const pointer = join(scratch, 'pointer');
writeFileSync(`${pointer}.swift`, `import CoreGraphics
import Foundation
let args = CommandLine.arguments
if args[1] == "where" { let point = CGEvent(source: nil)!.location; print("\\(point.x) \\(point.y)"); exit(0) }
let point = CGPoint(x: Double(args[2])!, y: Double(args[3])!)
CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)!.post(tap: .cghidEventTap)
if args[1] == "click" {
  usleep(80000)
  CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left)!.post(tap: .cghidEventTap)
  usleep(40000)
  CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)!.post(tap: .cghidEventTap)
}
`);
await run('/usr/bin/swiftc', ['-O', `${pointer}.swift`, '-o', pointer], { timeout: 180000 });
const [startX, startY] = (await run(pointer, ['where'])).stdout.trim().split(' ');
const env = { ...process.env, HOME: home, ARARA_DISABLE_COMPANION_DOWNLOAD: '1', ARARA_VIBES_DISABLE_UPDATES: '1', ARARA_CODE_EXECUTABLE: join(scratch, 'missing-code'), ARARA_CODE_ARGS: '[]', ARARA_VIBES_ROOT: join(scratch, 'workspace'), ARARA_VIBES_PROFILE: join(scratch, 'host-profile'), ARARA_VIBES_SESSION_FILE: join(scratch, 'session.json'), ARARA_VIBES_HOSTS: join(scratch, 'hosts') };
for (const key of ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'VSCODE_PORTABLE', 'VSCODE_IPC_HOOK_CLI']) delete env[key];
const vibes = spawn(require('electron'), [harness], { env, stdio: ['ignore', 'inherit', 'inherit'] });
let browser;
const sleep = ms => new Promise(done => setTimeout(done, ms));
const until = async (page, predicate, message, timeout = 15000) => {
  try { await page.waitForFunction(predicate, undefined, { timeout, polling: 50 }); } catch { throw new Error(message); }
};
const record = page => page.evaluate(() => {
  const frames = [];
  const opacity = id => { const node = document.getElementById(id); const style = getComputedStyle(node); return node.getClientRects().length && style.visibility !== 'hidden' ? Number(style.opacity) : 0; };
  const visible = () => ['loading', 'recover', 'update', 'onboarding', 'signin'].filter(id => { const style = getComputedStyle(document.getElementById(id)); return style.visibility !== 'hidden' && Number(style.opacity) > 0.01; });
  const sample = () => { frames.push({ at: performance.now(), height: innerHeight, content: opacity('content'), tabs: opacity('tab-strip'), visible: visible() }); window.vibesFrame = requestAnimationFrame(sample); };
  window.vibesFrames = frames; cancelAnimationFrame(window.vibesFrame); sample();
});
const frames = page => page.evaluate(() => { cancelAnimationFrame(window.vibesFrame); return window.vibesFrames; });
const click = async (page, selector) => {
  const point = await page.evaluate(selector => { const rect = document.querySelector(selector).getBoundingClientRect(); return { x: screenX + rect.left + rect.width / 2, y: screenY + rect.top + rect.height / 2 }; }, selector);
  await run(pointer, ['click', String(point.x), String(point.y)]);
};
try {
  const deadline = Date.now() + 30000;
  while (!browser && Date.now() < deadline) { try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch { await sleep(200); } }
  assert.ok(browser, 'Arara Vibes did not expose its isolated debugging endpoint');
  let page;
  while (!page && Date.now() < deadline) { page = browser.contexts().flatMap(context => context.pages()).find(item => item.url().startsWith('http://127.0.0.1')); if (!page) await sleep(100); }
  assert.ok(page, 'Arara Vibes shell page did not open');
  await until(page, () => document.documentElement.dataset.screen === 'recover', 'Missing Arara Code did not show the recovery screen');
  assert.deepEqual(await page.evaluate(() => ({ background: getComputedStyle(document.getElementById('recover')).backgroundColor, focused: document.activeElement?.id, text: [...document.getElementById('recover').querySelectorAll('h1, p')].map(node => node.textContent) })), { background: 'rgba(0, 0, 0, 0.7)', focused: 'retry', text: ['Arara did not start'] });
  await record(page);
  await page.evaluate(() => document.getElementById('retry').click());
  await until(page, () => window.vibesFrames.some(frame => !frame.visible.length), 'Try again did not fade the recovery screen out');
  await until(page, () => document.documentElement.dataset.screen === 'recover' && Number(getComputedStyle(document.getElementById('recover')).opacity) > 0.99, 'Recovery did not return after the second failure', 30000);
  const retry = await frames(page);
  assert.ok(retry.every(frame => frame.visible.length <= 1), `Screens overlapped: ${JSON.stringify(retry.filter(frame => frame.visible.length > 1).slice(0, 3))}`);
  assert.ok(retry.some(frame => frame.visible.length === 0), 'Screens must fade out before the next one fades in');
  process.stdout.write('PASS: real app shows one recovery screen with the Mac modal background, focuses Try again and fades screens out before the next one appears\n');

  await run('/usr/bin/osascript', ['-e', 'tell application "Finder" to activate']);
  const frontmost = async () => Number((await run('/usr/bin/osascript', ['-e', 'tell application "System Events" to get unix id of first process whose frontmost is true'])).stdout.trim());
  for (let attempt = 0; attempt < 50 && await frontmost() === vibes.pid; attempt++) await sleep(100);
  assert.notEqual(await frontmost(), vibes.pid, 'Another application did not become active');
  await record(page);
  await click(page, '#expand');
  await until(page, () => document.body.dataset.expanded === 'false', 'A single click on the inactive window did not collapse Arara Vibes', 5000);
  const collapse = await frames(page);
  const shrinking = collapse.findIndex(frame => frame.height < collapse[0].height);
  assert.ok(shrinking > 0, 'The window did not shrink');
  assert.ok(collapse.slice(0, shrinking).some(frame => frame.content < 0.05), 'Content must fade out before the window shrinks');
  assert.ok(collapse.slice(shrinking).every(frame => frame.content < 0.05), 'Content must stay hidden while the window shrinks');
  process.stdout.write('PASS: one real click on the inactive window collapses it, fading the content before the native resize\n');

  await sleep(300);
  await record(page);
  await click(page, '#expand');
  await until(page, () => document.body.dataset.expanded === 'true' && !document.body.dataset.resizing && Number(getComputedStyle(document.getElementById('content')).opacity) > 0.99, 'Expanding did not restore the content', 5000);
  const expand = await frames(page);
  const final = expand.at(-1).height;
  const growing = expand.filter(frame => frame.height > expand[0].height && frame.height < final);
  assert.ok(growing.length > 0, 'The window did not animate while expanding');
  assert.ok(growing.every(frame => frame.content < 0.05 && frame.tabs < 0.05), 'Content and tabs must stay hidden while the window grows');
  const fading = expand.filter(frame => frame.height === final && frame.content > 0.05 && frame.content < 0.95);
  assert.ok(fading.length > 0, 'Content must fade in after the window grows');
  const gaps = expand.slice(1).map((frame, index) => frame.at - expand[index].at);
  assert.ok(Math.max(...gaps) < 120, `Expanding dropped frames: longest gap ${Math.round(Math.max(...gaps))} ms`);
  process.stdout.write(`PASS: expanding grows the window natively, then fades content and tabs in; longest frame gap ${Math.round(Math.max(...gaps))} ms\n`);
} finally {
  await browser?.close().catch(() => undefined);
  if (vibes.exitCode === null) { const exited = new Promise(done => vibes.once('exit', done)); vibes.kill(); await exited; }
  await run(pointer, ['move', startX, startY]).catch(() => undefined);
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
