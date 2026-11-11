import assert from 'node:assert/strict';
import { app, BrowserWindow } from 'electron';
import { startShell } from '../src/host/server';
import { defaultPreferences } from '../src/main/preferences';

app.setPath('userData', process.argv[3]);
void app.whenReady().then(async () => {
  let attempts = 0;
  let started = 0;
  const server = await startShell(process.argv[2], {
    locale: 'en', state: () => ({ pinned: true, expanded: true }),
    run: async action => { if (action === 'startHost') started++; },
    preferences: async update => {
      if (update !== undefined && ++attempts === 1) throw new Error('Startup registration failed');
      return { ...defaultPreferences, ...(update as object ?? {}) };
    },
  });
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const evaluate = (source: string) => window.webContents.executeJavaScript(source);
  const until = async (predicate: string) => {
    const result = await evaluate(`new Promise(resolve=>{const deadline=Date.now()+10000;const check=()=>{if(${predicate})resolve(true);else if(Date.now()>deadline)resolve(false);else setTimeout(check,50)};check()})`);
    assert.equal(result, true, predicate);
  };
  try {
    await window.loadURL(server.url);
    await until("!document.getElementById('onboarding').hidden");
    assert.equal(await evaluate('(async()=>{await Promise.all([...document.images].map(image=>image.decode()));return [...document.images].every(image=>image.naturalWidth>0)})()'), true);
    await evaluate("document.getElementById('onboarding-continue').click()");
    await until("!document.getElementById('feedback').hidden && !document.getElementById('onboarding-continue').disabled");
    assert.equal(await evaluate("document.getElementById('onboarding').hidden"), false);
    assert.equal(attempts, 1); assert.equal(started, 0);
    await evaluate("document.getElementById('onboarding-continue').click()");
    await until("document.getElementById('onboarding').hidden && document.getElementById('feedback').hidden");
    assert.equal(attempts, 2);
    assert.equal(await evaluate("document.getElementById('brand-logo').getAttribute('src')"), 'logo.svg');
    assert.equal(await evaluate("(async()=>{const response=await fetch('logo-animated.svg');const svg=await response.text();return response.ok&&svg.includes('@keyframes arara-contour')&&svg.includes('#f5cc64')})()"), true);
    await evaluate("document.getElementById('loading').dataset.off='true'");
    await evaluate("document.getElementById('recover').hidden=false; const frame=document.createElement('iframe');frame.className='surface-frame';frame.id='recovery-fixture';document.getElementById('stage').prepend(frame)");
    await until("(()=>{const panel=document.getElementById('recover').getBoundingClientRect();const stage=document.getElementById('stage').getBoundingClientRect();return getComputedStyle(document.getElementById('recover')).position==='absolute'&&panel.left===stage.left&&panel.right===stage.right&&panel.top===stage.top&&panel.bottom===stage.bottom})()");
    await evaluate("document.getElementById('recover').hidden=true;document.getElementById('recovery-fixture').remove()");
    process.stdout.write('PASS: shell branding loads; failed startup registration shows an error and keeps onboarding open until a successful retry\n');
  } finally { window.destroy(); server.close(); }
  app.quit();
}).catch(error => { process.stderr.write(`${error.stack}\n`); app.exit(1); });
