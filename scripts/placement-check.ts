import assert from 'node:assert/strict';
import { app, BrowserWindow, screen } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const directory = process.argv[2];
const profile = process.argv[3];
const wait = async (predicate: () => boolean, message: string) => {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};
app.setPath('userData', profile);
writeFileSync(join(profile, 'preferences.json'), JSON.stringify({ onboarded: true, launchAtLogin: false, showInBar: false, splash: false }));

const check = async (window: BrowserWindow) => {
  await new Promise<void>(resolve => window.webContents.once('did-finish-load', () => resolve()));
  await wait(() => !window.webContents.isLoading(), 'Shell did not finish loading');
  const action = async () => {
    const reply = await window.webContents.executeJavaScript("window.araraVibes.action({action:'expand'})");
    assert.equal(reply.status, 200);
    await new Promise(resolve => setTimeout(resolve, 80));
    return window.getBounds();
  };
  if (process.argv.includes('--restore-placement')) {
    const saved = JSON.parse(readFileSync(join(profile, 'window-placement.json'), 'utf8'));
    assert.deepEqual(window.getBounds(), saved.expanded, 'Relaunching must restore the latest expanded bounds');
    assert.deepEqual(await action(), { ...saved.expanded, ...saved.compact, height: 44 }, 'Relaunching must preserve the independent compact location');
    assert.deepEqual(await action(), saved.expanded);
    process.stdout.write('PASS: native window restores both remembered positions after restarting the application\n');
    return;
  }
  const area = screen.getPrimaryDisplay().workArea;
  const opened = { x: area.x + 40, y: area.y + 70, width: 400, height: Math.min(500, area.height - 100) };
  window.setBounds(opened);
  await wait(() => window.getBounds().x === opened.x && window.getBounds().y === opened.y, 'Native move did not finish');
  const compact = await action();
  assert.equal(compact.height, 44);
  assert.equal(compact.x, area.x + area.width - opened.width - 12);
  assert.equal(compact.y, area.y + 12);
  assert.deepEqual(await action(), opened, 'Expanding without a drag must restore the expanded location');
  assert.deepEqual(await action(), compact, 'Collapsing must reuse the last compact location');
  const moved = { ...compact, x: area.x + 100, y: area.y + 100 };
  window.setPosition(moved.x, moved.y);
  await wait(() => window.getBounds().x === moved.x && window.getBounds().y === moved.y, 'Compact move did not finish');
  const movedOpen = { ...opened, x: moved.x, y: moved.y };
  assert.deepEqual(await action(), movedOpen, 'A dragged compact window must expand at its new location');
  const second = { ...opened, x: area.x + 200, y: area.y + 130, width: 420 };
  window.setBounds(second);
  const remembered = { ...moved, width: second.width };
  assert.deepEqual(await action(), remembered, 'Moving the expanded window must preserve the remembered compact location');
  assert.deepEqual(await action(), second, 'A later expansion without dragging must restore the latest expanded location');
  const rapid = await window.webContents.executeJavaScript("Promise.all([window.araraVibes.action({action:'expand'}),window.araraVibes.action({action:'expand'})])");
  assert.ok(rapid.every((reply: { status: number }) => reply.status === 200));
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.deepEqual(window.getBounds(), remembered, 'Concurrent actions must finish one transition without corrupting positions');
  assert.deepEqual(await action(), second);
  const saved = JSON.parse(readFileSync(join(profile, 'window-placement.json'), 'utf8'));
  assert.deepEqual(saved.expanded, second);
  assert.deepEqual(saved.compact, { x: moved.x, y: moved.y });
  process.stdout.write('PASS: native window restores expanded bounds, opens at dragged compact bounds, remembers both positions and serializes rapid actions\n');
};

app.once('browser-window-created', (_event, window) => {
  void check(window).then(() => app.quit()).catch(error => { process.stderr.write(`${error.stack}\n`); app.exit(1); });
});
require(join(directory, 'main.cjs'));
