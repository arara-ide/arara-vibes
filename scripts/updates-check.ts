import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { startShell } from '../src/host/server';
import { defaultPreferences } from '../src/main/preferences';
import { Updates, type UpdateProduct } from '../src/main/updates';

app.setPath('userData', process.argv[3]);
void app.whenReady().then(async () => {
  const versions = { 'arara-code': '1.135.07400', 'arara-vibes': '0.1.0' };
  const latest = { 'arara-code': '1.135.07430', 'arara-vibes': 'v0.2.0' };
  const order: string[] = [];
  let failCode = false;
  let releaseCode: (() => void) | undefined;
  const manager = new Updates({
    current: async product => ({ version: versions[product] }), latest: async product => latest[product],
    download: async (product, version) => { order.push(`download:${product}:${version}`); return product; },
    install: async (product, _file, version) => {
      order.push(`install:${product}`);
      if (product === 'arara-code') {
        if (failCode) throw new Error('Permission denied');
        await new Promise<void>(resolve => { releaseCode = resolve; });
      }
      versions[product] = version;
    },
    changed: updates => server?.emit({ type: 'updates', updates }),
  });
  const server = await startShell(process.argv[2], {
    locale: 'en', state: () => ({ pinned: true, expanded: true, updates: manager.state() }), run: async () => {},
    preferences: async () => ({ ...defaultPreferences, onboarded: true }),
    checkUpdates: () => manager.check(), installUpdate: (product?: UpdateProduct) => manager.update(product),
  });
  const window = new BrowserWindow({ width: 360, height: 480, show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const evaluate = (source: string) => window.webContents.executeJavaScript(source);
  const until = async (predicate: string) => {
    const value = await evaluate(`new Promise(resolve=>{const deadline=Date.now()+10000;const check=()=>{if(${predicate})resolve(true);else if(Date.now()>deadline)resolve(false);else setTimeout(check,25)};check()})`);
    assert.equal(value, true, predicate);
  };
  try {
    await window.loadURL(server.url);
    await evaluate("document.getElementById('updates-open').click()");
    await until("document.querySelectorAll('.update-product').length===2 && !document.getElementById('update-install').disabled");
    await until("Number(getComputedStyle(document.getElementById('update')).opacity) > 0.99");
    assert.equal(await evaluate("[...document.querySelectorAll('#titlebar .window-actions button')].every(button=>button.querySelector('svg')&&button.getAttribute('aria-label'))"), true);
    assert.equal(await evaluate("document.querySelector('[data-product=arara-code]').textContent.includes('1.135.07400')"), true);
    assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true);
    assert.equal(await evaluate("document.querySelector('#update > img').getBoundingClientRect().top>=document.getElementById('update').getBoundingClientRect().top"), true);
    await evaluate("document.getElementById('update').scrollTop=document.getElementById('update').scrollHeight");
    assert.equal(await evaluate("document.getElementById('update-close').getBoundingClientRect().bottom<=innerHeight"), true);
    const screenshot = join(process.argv[3], 'updates.png');
    await writeFile(screenshot, (await window.webContents.capturePage()).toPNG());
    process.stdout.write(`Updates screenshot: ${screenshot}\n`);
    await evaluate("document.getElementById('update-close').click()");
    assert.equal(await evaluate("document.getElementById('update').hidden"), true);
    assert.deepEqual(order, []);
    await evaluate("document.getElementById('updates-open').click()");
    await until("!document.getElementById('update-install').disabled");
    await evaluate("document.getElementById('update-install').click()");
    await until("document.querySelector('[data-product=arara-code] .update-status').textContent.includes('Installing')");
    assert.equal(await evaluate("document.getElementById('update-close').disabled && document.getElementById('update-check').disabled"), true);
    assert.deepEqual(order, ['download:arara-code:1.135.07430', 'download:arara-vibes:v0.2.0', 'install:arara-code']);
    releaseCode!();
    await until("document.querySelector('[data-product=arara-vibes] .update-status').textContent.includes('Restarting')");
    assert.equal(await evaluate("document.querySelector('[data-product=arara-code] .update-status').textContent"), 'Up to date');
    versions['arara-code'] = '1.135.07400'; versions['arara-vibes'] = '0.1.0'; order.length = 0; failCode = true;
    await manager.check();
    await evaluate("document.getElementById('update-install').click()");
    await until("document.querySelector('[data-product=arara-code] .update-status').textContent.includes('Could not install')");
    assert.equal(order.includes('install:arara-vibes'), false);
    assert.equal(await evaluate("document.getElementById('update-check').disabled"), false);
    process.stdout.write('PASS: built updates screen shows both versions, honors Later, serializes installations, disables busy controls and preserves Vibes after a Code failure\n');
  } finally { window.destroy(); server.close(); }
  app.quit();
}).catch(error => { process.stderr.write(`${error.stack}\n`); app.exit(1); });
