import { registerShellBridge } from './bridge';
import { app, BrowserWindow, clipboard, globalShortcut, Menu, nativeTheme, Tray, nativeImage, screen, shell, systemPreferences } from 'electron';
import { join, resolve } from 'node:path';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { startShell } from '../host/server';
import { companion } from '../host/companion';
import { setLocale, t } from '../i18n';
import { Updates, UpdateFailure, type UpdateProduct } from './updates';
import { updateCode } from './codeUpdate';
import { codeInstallation } from '../host/installation';
import { BackgroundHost, backgroundRuntime, prepareBackgroundRuntime } from '../host/background';
import { CHECK_INTERVAL_MS, debInstallCommand, installPreparedUpdate } from './update';
import { defaultShortcut, loadPreferences, normalizePreferences, resolveLanguage, savePreferences, loginCommand, setMacAutostart, setLinuxAutostart, type Preferences } from './preferences';
import { APP_ICON, TRAY_ASSETS } from './tray';

const smoke = process.argv.includes('--smoke-test');
const integration = process.argv.includes('--integration-test');
if (smoke || integration) app.setPath('userData', mkdtempSync(join(tmpdir(), 'arara-vibes-smoke-')));
let window: BrowserWindow | undefined;
let tray: Tray | undefined;
let server: Awaited<ReturnType<typeof startShell>> | undefined;
const pinned = true;
let expanded = true;
let expandedHeight = 640;
let glass = false;
const abort = new AbortController();
const runtime = companion(__dirname);
let background: BackgroundHost | undefined;
let quitting = false;
let hostStopped = false;
let stopping: Promise<void> | undefined;
const live = () => window && !window.isDestroyed() ? window : undefined;
const show = () => { const current = live(); if (!current) return; const wasHidden = !current.isVisible(); if (wasHidden && preferences?.splash) { void current.webContents.executeJavaScript('window.vibesSplash?.()').catch(() => undefined).finally(() => { if (!current.isDestroyed()) { current.show(); current.focus(); } }); return; } current.show(); current.focus(); };
const toggle = () => { const current = live(); if (current?.isVisible() && current.isFocused()) current.hide(); else show(); };

const MIN_WIDTH = 360;
function animateBounds(target: BrowserWindow, to: Electron.Rectangle): Promise<void> {
  const from = target.getBounds();
  if (systemPreferences.getAnimationSettings?.().prefersReducedMotion) { target.setBounds(to); return Promise.resolve(); }
  return new Promise(resolve => {
  const start = Date.now(); const duration = 220;
  const step = () => {
    if (target.isDestroyed()) { resolve(); return; }
    const progress = Math.min(1, (Date.now() - start) / duration); const eased = 1 - Math.pow(1 - progress, 3);
    const mix = (a: number, b: number) => Math.round(a + (b - a) * eased);
    target.setBounds({ x: mix(from.x, to.x), y: mix(from.y, to.y), width: mix(from.width, to.width), height: mix(from.height, to.height) });
    if (progress < 1) setTimeout(step, 16); else resolve();
  };
  step();
  });
}
const preferencesFile = () => join(app.getPath('userData'), 'preferences.json');
let preferences: Preferences;
function applyLaunchAtLogin(enabled: boolean) {
  const command = loginCommand(process.env.APPIMAGE ?? process.execPath, app.isPackaged ? undefined : app.getAppPath());
  if (process.platform === 'linux') { setLinuxAutostart(enabled, command); return; }
  if (process.platform === 'darwin') {
    setMacAutostart(enabled, command);
    if (app.isPackaged && app.getLoginItemSettings().openAtLogin) app.setLoginItemSettings({ openAtLogin: false });
    return;
  }
  const [path, ...args] = command;
  app.setLoginItemSettings({ openAtLogin: enabled, path, args });
}

function trayMenu() {
  return Menu.buildFromTemplate([{ label: t('Show Arara Vibes'), click: show }, { label: t('Check for updates'), click: () => { show(); server?.emit({ type: 'openUpdates' }); void updates.check(); } }, { label: t('Hide Arara Vibes'), click: () => window?.hide() }, { type: 'separator' }, { label: t('Quit'), click: () => app.quit() }]);
}
function applyShowInBar(enabled: boolean) {
  if (process.platform === 'win32') { live()?.setSkipTaskbar(!enabled); if (!tray) createTray(); return; }
  if (enabled && !tray) createTray();
  if (!enabled && tray) { tray.destroy(); tray = undefined; }
}
function createTray() {
  const assets = TRAY_ASSETS;
  const icon = nativeImage.createFromPath(resolve(__dirname, assets.image));
  if (icon.isEmpty()) return;
  const sized = icon.resize({ width: 18, height: 18 });
  if (assets.retina) sized.addRepresentation({ scaleFactor: 2, buffer: readFileSync(resolve(__dirname, assets.retina)) });
  tray = new Tray(sized); tray.setToolTip('Arara Vibes'); tray.setContextMenu(trayMenu()); tray.on('click', toggle);
}
function registerShortcut(next: string, previous?: string) {
  if (previous) globalShortcut.unregister(previous);
  try { if (globalShortcut.register(next, toggle)) return true; } catch { }
  if (previous) try { globalShortcut.register(previous, toggle); } catch { }
  return false;
}
function shortcutRecording(recording: boolean) {
  if (recording) globalShortcut.unregister(preferences.shortcut);
  else if (!globalShortcut.isRegistered(preferences.shortcut)) registerShortcut(preferences.shortcut);
}
let updates: Updates;
let codeUpdating = false;
const installedCode = () => runtime.installedCompanion('arara-code');
const installation = () => codeInstallation(installedCode());
const updateOptions = (product: UpdateProduct) => ({ signal: abort.signal, arch: app.runningUnderARM64Translation ? 'arm64' : process.arch, format: product === 'arara-code' ? installation()?.format : process.platform === 'linux' && !process.env.APPIMAGE ? 'deb' : undefined });
async function installCodeUpdate(file: string, version: string) {
  if (process.platform === 'linux' && file.endsWith('.deb')) return debInstallCommand(file);
  const previous = installation();
  if (process.platform === 'win32' && previous?.product.target === 'user') throw new UpdateFailure('migration');
  codeUpdating = true;
  try {
    await updateCode(version, {
      pause: async () => {
        const restart = !!background;
        if (background) { await server?.shutdown(); await background.stop(); background = undefined; }
        return restart;
      },
      install: async () => {
        if (process.platform === 'darwin') await runtime.installMacDmg(file, 'arara-code', { appRoot: previous?.appRoot, open: false });
        else { const error = await shell.openPath(file); if (error) throw new Error(error); }
      },
      currentVersion: () => installation()?.product.version,
      resume: async () => { codeUpdating = false; await run('startHost'); },
      signal: abort.signal, now: Date.now, wait: () => new Promise(resolve => setTimeout(resolve, 1000)),
    });
  } finally { codeUpdating = false; }
}
function createUpdates() {
  return new Updates({
    current: async product => {
      if (product === 'arara-vibes') return { version: app.getVersion(), development: !app.isPackaged };
      const options = backgroundRuntime(__dirname, installedCode());
      const current = installation();
      if (options?.development) return { development: true };
      if (installedCode() && !current) throw new Error('Installed application metadata unavailable');
      return { version: current?.product.version };
    },
    latest: product => runtime.latestCompanion(product, updateOptions(product)),
    download: (product, version) => runtime.prepareCompanion(product, { ...updateOptions(product), version, root: join(app.getPath('userData'), 'updates', product, version) }),
    install: async (product, file, version) => {
      if (product === 'arara-code') return installCodeUpdate(file, version);
      return installPreparedUpdate(file, { platform: process.platform, appRoot: process.execPath, pid: process.pid, appImage: process.env.APPIMAGE, installAppImage: (...args) => runtime.installAppImage(...args), installMacDmg: (...args) => runtime.installMacDmg(...args), openPath: file => shell.openPath(file), quit: () => app.quit() });
    },
    changed: state => server?.emit({ type: 'updates', updates: state }),
  });
}
function watchUpdates() {
  if (!app.isPackaged || process.env.ARARA_VIBES_DISABLE_UPDATES === '1') return;
  void updates.check(); setInterval(() => void updates.check(), CHECK_INTERVAL_MS).unref();
}
async function updatePreferences(update?: unknown) {
  if (update === undefined) return { ...preferences, defaultShortcut: defaultShortcut() };
  const previous = preferences;
  preferences = normalizePreferences(update, preferences);
  savePreferences(preferencesFile(), preferences);
  if (previous.launchAtLogin !== preferences.launchAtLogin) try { applyLaunchAtLogin(preferences.launchAtLogin); } catch (error) { preferences = previous; savePreferences(preferencesFile(), preferences); throw error; }
  if (previous.shortcut !== preferences.shortcut && !registerShortcut(preferences.shortcut, globalShortcut.isRegistered(previous.shortcut) ? previous.shortcut : undefined)) { preferences.shortcut = previous.shortcut; savePreferences(preferencesFile(), preferences); registerShortcut(preferences.shortcut); }
  if (previous.showInBar !== preferences.showInBar) applyShowInBar(preferences.showInBar);
  if (previous.language !== preferences.language) { setLocale(resolveLanguage(preferences.language, app.getLocale())); await server?.shutdown(); await background?.stop(); background = undefined; }
  return { ...preferences, defaultShortcut: defaultShortcut() };
}
async function run(action: string) {
  if (abort.signal.aborted) return;
  if (action === 'expand' && window) {
    const bounds = window.getBounds();
    if (expanded) expandedHeight = bounds.height;
    expanded = !expanded;
    window.setMinimumSize(360, expanded ? 360 : 44);
    const marker = join(app.getPath('userData'), 'compact-placed');
    const target = { ...bounds, height: expanded ? expandedHeight : 44 };
    if (!expanded && !existsSync(marker)) {
      const area = screen.getDisplayMatching(bounds).workArea;
      Object.assign(target, { x: area.x + area.width - bounds.width - 12, y: area.y + 12 });
      try { mkdirSync(app.getPath('userData'), { recursive: true }); writeFileSync(marker, ''); } catch { }
    }
    await animateBounds(window, target);
  }
  if (action === 'hide') { if (preferences.closeAction === 'quit') app.quit(); else window?.hide(); }
  if (action === 'startHost' && !smoke) {
    if (codeUpdating) return;
    if (background) { await server?.shutdown(); await background.stop(); }
    if (!background) {
      const options = backgroundRuntime(__dirname, runtime.installedCompanion('arara-code'), app.commandLine.hasSwitch('no-sandbox'), resolveLanguage(preferences.language, app.getLocale()));
      if (!options && process.env.ARARA_DISABLE_COMPANION_DOWNLOAD !== '1') {
        server?.emit({ type: 'openUpdates' });
        void updates.check();
      }
      if (!options) throw new Error(t('Open Updates to install or update Arara Code and start the chat.'));
      background = new BackgroundHost(await prepareBackgroundRuntime(options));
    }
    await background.start();
  }
}

if (!smoke && !integration && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_event, argv) => { if (!argv.includes('--hidden')) show(); });
  app.setName('Arara Vibes');
  void app.whenReady().then(async () => {
    preferences = loadPreferences(preferencesFile());
    if (!smoke && !integration && preferences.launchAtLogin) try { applyLaunchAtLogin(true); } catch { preferences.launchAtLogin = false; savePreferences(preferencesFile(), preferences); }
    const locale = resolveLanguage(preferences.language, app.getLocale());
    setLocale(locale);
    updates = createUpdates();
    server = await startShell(__dirname, { run, state: () => ({ pinned, expanded, glass, updates: updates.state() }), locale, preferences: updatePreferences, checkUpdates: () => updates.check(), installUpdate: product => updates.update(product), copyText: text => clipboard.writeText(text), shortcutRecording });
    void watchUpdates();
    const area = screen.getPrimaryDisplay().workArea;
    const width = Math.min(MIN_WIDTH, area.width);
    expandedHeight = Math.min(480, area.height - 40);
    window = new BrowserWindow({ icon: resolve(__dirname, APP_ICON), width, height: expandedHeight, minWidth: MIN_WIDTH, minHeight: 360, maxWidth: 520, maximizable: false, fullscreenable: false,
      x: area.x + Math.round((area.width - width) / 2), y: area.y + 20,
      frame: false, alwaysOnTop: true, transparent: process.platform === 'darwin', visualEffectState: 'active', backgroundColor: '#1b1d21', show: false,
      webPreferences: { preload: resolve(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    registerShellBridge(window.webContents, server.url, server.dispatch);
    const focused = (value: boolean) => { const current = live(); if (current) void current.webContents.executeJavaScript(`document.documentElement.dataset.focused = '${value}'`).catch(() => undefined); };
    window.on('focus', () => focused(true)); window.on('blur', () => focused(false));
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (url !== server?.url) event.preventDefault(); });
    window.on('close', event => { if (quitting) return; event.preventDefault(); if (preferences.closeAction === 'quit') app.quit(); else window?.hide(); });
    if (process.platform === 'darwin') {
      nativeTheme.themeSource = 'dark';
      window.setBackgroundColor('#00000000'); glass = true;
      try {
        const liquid = require('electron-liquid-glass') as { isGlassSupported(): boolean; addView(handle: Buffer, options: { cornerRadius?: number; tintColor?: string }): number; unstable_setVariant(id: number, variant: number): void; GlassMaterialVariant: { clear: number } };
        if (liquid.isGlassSupported()) {
          const id = liquid.addView(window.getNativeWindowHandle(), { cornerRadius: 12, tintColor: '#00000080' });
          liquid.unstable_setVariant?.(id, liquid.GlassMaterialVariant.clear);
        } else window.setBackgroundColor('#80000000');
      } catch { window.setBackgroundColor('#80000000'); }
    }
    window.webContents.on('did-finish-load', () => { void window?.webContents.executeJavaScript(`document.documentElement.dataset.motion = '${preferences.animations ? 'on' : 'off'}'`).catch(() => undefined); });
    window.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key.toLowerCase() === 'w' && (process.platform === 'darwin' ? input.meta : input.control) && !input.alt && !input.shift) {
        event.preventDefault(); void window?.webContents.executeJavaScript('window.vibesCloseActiveTab?.()').catch(() => undefined);
      }
    });
    await window.loadURL(server.url);
    if (!process.argv.includes('--hidden')) show();
    if (integration) {
      const onboarded = await window.webContents.executeJavaScript(`new Promise(resolve=>{const deadline=Date.now()+10000;const check=()=>{const screen=document.getElementById('onboarding');if(screen&&!screen.hidden){document.getElementById('onboarding-login').checked=false;document.getElementById('onboarding-continue').click();resolve(true)}else if(Date.now()>deadline)resolve(false);else setTimeout(check,50)};check()})`);
      if (!onboarded) throw new Error('First-run onboarding did not appear');
      process.stdout.write('PASS: first-run onboarding offered startup and bar options\n');
      const deadline = Date.now() + 60000;
      let chatReady = false;
      while (Date.now() < deadline && !chatReady) {
        for (const frame of window.webContents.mainFrame.frames) {
          chatReady = Boolean(await frame.executeJavaScript(`!!document.querySelector('#input') && !!document.querySelector('.arara-chat') && getComputedStyle(document.querySelector('.arara-chat')).fontFamily.length > 0`).catch(() => false));
          if (chatReady) break;
        }
        if (!chatReady) await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (!chatReady) throw new Error('Automatic background startup did not render the original chat');
      for (const frame of window.webContents.mainFrame.frames) {
        const setup = await frame.executeJavaScript(`(()=>{if(!document.querySelector('.arara-chat'))return null;const panel=document.createElement('section');panel.className='cli-setup question-panel';document.querySelector('.arara-chat').append(panel);AraraChatKit.renderSetupPanel(panel,{title:'Platform setup',help:'',actions:[]});const style=getComputedStyle(panel);const result={background:style.backgroundColor,radius:style.borderRadius,padding:style.paddingLeft};panel.remove();return result})()`).catch(() => null) as { background: string; radius: string; padding: string } | null;
        if (setup && (setup.background !== 'rgba(0, 0, 0, 0.2)' || setup.radius !== '12px' || setup.padding !== '12px')) throw new Error(`Platform setup surface failed: ${JSON.stringify(setup)}`);
      }

      for (let index = 0; index < 3; index++) {
        const count = await window.webContents.executeJavaScript(`document.querySelectorAll('[role=tab]').length`);
        await window.webContents.executeJavaScript(`document.querySelector('#platform-options button').click()`);
        await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const deadline=Date.now()+10000;const check=()=>{if(document.querySelectorAll('[role=tab]').length>${count}&&document.querySelectorAll('.surface-frame').length>${count})resolve(true);else if(Date.now()>deadline)reject(Error('Tab was not created with its original frame'));else setTimeout(check,50)};check()})`);
      }
      const tabs = await window.webContents.executeJavaScript(`({count:document.querySelectorAll('[role=tab]').length,numbered:[...document.querySelectorAll('[role=tab]')].some(tab=>/Codex [123]/.test(tab.textContent)),frames:document.querySelectorAll('.surface-frame').length})`);
      if (tabs.count < 4 || tabs.numbered || tabs.frames < 4) throw new Error(`Independent conversation tabs failed: ${JSON.stringify(tabs)}`);
      const drag = await window.webContents.executeJavaScript(`(()=>{document.getElementById('tab-strip').scrollLeft=0;const tabs=[...document.querySelectorAll('.browser-tab')];const source=tabs[tabs.length-1];const target=tabs[0];const transfer=new DataTransfer();const rect=target.getBoundingClientRect();window.draggedVibesTab=source.dataset.surface;source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));return new Promise(resolve=>requestAnimationFrame(()=>{document.getElementById('tabs').dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:rect.left,clientY:rect.top+rect.height/2}));const marker=document.querySelector('.tab-drop-marker');const result={enabled:tabs.every(tab=>tab.draggable),ghost:!!document.querySelector('.tab-drag-preview'),faded:Number(getComputedStyle(source).opacity)<1,marker:!marker.hidden&&getComputedStyle(marker).width==='2px'};document.getElementById('tabs').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:rect.left,clientY:rect.top+rect.height/2}));resolve(result)}))})()`);
      if (!drag.enabled || !drag.ghost || !drag.faded || !drag.marker) throw new Error('Tab drag preview, faded source or insertion marker failed');
      await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const deadline=Date.now()+5000;const check=()=>{if(document.querySelector('.browser-tab').dataset.surface===window.draggedVibesTab&&!document.querySelector('.tab-drag-preview'))resolve(true);else if(Date.now()>deadline)reject(Error('Dropped tab order was not retained'));else setTimeout(check,50)};check()})`);
      const picker = await window.webContents.executeJavaScript(`(()=>{const picker=document.getElementById('tab-picker');picker.open=true;picker.dispatchEvent(new Event('toggle'));const anchor=picker.querySelector('summary').getBoundingClientRect();const panel=picker.querySelector('.picker-panel').getBoundingClientRect();const options=[...document.querySelectorAll('#platform-options button')];const result={sharing:options.findIndex(option=>option.dataset.platform==='sharing')===options.findIndex(option=>option.dataset.platform==='settings')-1,iconed:options.every(option=>option.querySelector('.option-icon')),badge:!!document.querySelector('.model-badge'),below:panel.top>=anchor.bottom&&panel.left>=0&&panel.right<=innerWidth,inset:document.getElementById('tab-strip').getBoundingClientRect().left>0,motion:matchMedia('(prefers-reduced-motion: reduce)').matches};picker.open=false;return result})()`);
      await window.webContents.executeJavaScript(`document.querySelector('[data-platform="sharing"]').click()`);
      const sharingDeadline = Date.now() + 10000;
      let sharingReady = false;
      while (Date.now() < sharingDeadline && !sharingReady) {
        for (const frame of window.webContents.mainFrame.frames) {
          sharingReady = Boolean(await frame.executeJavaScript(`!!document.querySelector('#sharing-platforms') && !!document.querySelector('[data-sharing-role="lend"]') && !!document.querySelector('[data-sharing-role="borrow"]') && !document.querySelector('[data-sharing-role="borrow"]').disabled`).catch(() => false));
          if (sharingReady) {
            const choices = await frame.executeJavaScript(`(()=>{const buttons=[...document.querySelectorAll('[data-sharing-role]')];const widths=buttons.map(button=>button.getBoundingClientRect().width);const before=!document.querySelector('.sharing-form')&&document.querySelector('.sharing-choices').hidden;buttons[1].click();return{equal:Math.abs(widths[0]-widths[1])<1,before,select:!!document.querySelector('.sharing-choices .model-option'),form:!!document.querySelector('.sharing-form'),filled:buttons.every(button=>getComputedStyle(button).backgroundColor!=='rgba(0, 0, 0, 0)')}})()`) as { equal: boolean; before: boolean; select: boolean; form: boolean; filled: boolean };
            if (!choices.equal || !choices.before || !choices.select || choices.form || !choices.filled) throw new Error(`Sharing choices failed: ${JSON.stringify(choices)}`);
            await frame.executeJavaScript(`document.querySelector('.sharing-choices .model-option').click()`);
            await frame.executeJavaScript(`new Promise((resolve,reject)=>{const deadline=Date.now()+10000;const check=()=>{if(document.querySelector('.sharing-form input')&&!document.querySelector('[data-sharing-role="borrow"]').disabled)resolve(true);else if(Date.now()>deadline)reject(Error('Borrowing form did not render'));else setTimeout(check,50)};check()})`);
            const form = await frame.executeJavaScript(`(()=>{const input=document.querySelector('.sharing-form input');const style=getComputedStyle(input);const card=document.querySelector('.sharing-card');const close=card.querySelector('[data-action="stop"]');const reference=AraraChatKit.iconButton('',AraraChatKit.ICON.close,'Close');card.append(reference);const properties=['width','height','padding','borderRadius','backgroundColor'];const same=properties.every(property=>getComputedStyle(close)[property]===getComputedStyle(reference)[property]);reference.remove();return{same,justify:getComputedStyle(document.querySelector('.sharing-heading')).justifyContent,padding:style.paddingLeft===getComputedStyle(document.body).getPropertyValue('--pad-x').trim(),radius:style.borderRadius===getComputedStyle(document.body).getPropertyValue('--radius').trim(),background:style.backgroundColor}})()`) as { same: boolean; justify: string; padding: boolean; radius: boolean; background: string };
            if (!form.same || form.justify !== 'space-between' || !form.padding || !form.radius || form.background !== 'rgba(0, 0, 0, 0.2)') throw new Error('Borrowing form does not match Vibes fields and close controls');
            await frame.executeJavaScript(`document.querySelector('[data-action="stop"]').click()`);
            await frame.executeJavaScript(`new Promise((resolve,reject)=>{const deadline=Date.now()+5000;const check=()=>{if(!document.querySelector('.sharing-card'))resolve(true);else if(Date.now()>deadline)reject(Error('Cancel did not remove the pending borrower'));else setTimeout(check,50)};check()})`);
            await frame.executeJavaScript(`document.querySelector('[data-sharing-role="lend"]').click();[...document.querySelectorAll('.sharing-choices .model-option')].find(option=>option.textContent==='Claude Code').click()`);
            await frame.executeJavaScript(`new Promise((resolve,reject)=>{const deadline=Date.now()+10000;const check=()=>{if(document.querySelector('.sharing-code')&&!document.querySelector('[data-sharing-role="lend"]').disabled)resolve(true);else if(Date.now()>deadline)reject(Error('Sharing did not generate a code'));else setTimeout(check,50)};check()})`);
            const expiry = await frame.executeJavaScript(`(()=>{const status=document.querySelector('.sharing-status');return status.nextElementSibling.classList.contains('sharing-code')&&status.textContent.startsWith(AraraI18n.t('Code expires at {0}','').trim())&&!document.querySelector('.sharing-expiry')})()`);
            if (!expiry) throw new Error('Sharing must show the expiry once above the code');
            const occupied = await frame.executeJavaScript(`(()=>{const control=document.querySelector('[data-sharing-role="borrow"]');control.click();const hidden=![...document.querySelectorAll('.sharing-choices .model-option')].some(option=>option.dataset.platform==='claude');control.click();return hidden})()`);
            if (!occupied) throw new Error('Occupied platforms must not be offered again');
            break;
          }
        }
        if (!sharingReady) await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (!sharingReady) throw new Error('Sharing tab did not render the original controls');
      const sharingTab = await window.webContents.executeJavaScript(`document.querySelector('[role="tab"][aria-selected="true"]').textContent`);
      if (sharingTab !== t('Share limits') || await window.webContents.executeJavaScript(`!![...document.querySelectorAll('.tab-title')].find(tab=>tab.textContent==='Claude Code')`)) throw new Error('Configuring borrowing navigated away from sharing');
      const optionColor = await window.webContents.executeJavaScript(`(()=>{const option=document.querySelector('[data-platform="sharing"]');return getComputedStyle(option.querySelector('svg')).fill===getComputedStyle(option).color})()`);
      if (!optionColor) throw new Error('Sharing option icon does not inherit the menu color');
      await window.webContents.executeJavaScript(`document.querySelector('[data-platform="settings"]').click()`);
      await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const deadline=Date.now()+10000;const check=()=>{const tabs=[...document.querySelectorAll('.tab-title')];const sharing=tabs.find(tab=>tab.textContent===${JSON.stringify(t('Share limits'))});if(tabs.some(tab=>tab.textContent===${JSON.stringify(t('Settings'))})){sharing.click();resolve(true)}else if(Date.now()>deadline)reject(Error('Settings tab did not open'));else setTimeout(check,50)};check()})`);
      while (await window.webContents.executeJavaScript(`!![...document.querySelectorAll('.browser-tab')].find(tab=>tab.querySelector('.tab-title').textContent==='Codex')`)) {
        const count = await window.webContents.executeJavaScript(`document.querySelectorAll('.browser-tab').length`);
        await window.webContents.executeJavaScript(`[...document.querySelectorAll('.browser-tab')].find(tab=>tab.querySelector('.tab-title').textContent==='Codex').querySelector('.tab-close').click()`);
        await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const deadline=Date.now()+10000;const check=()=>{if(document.querySelectorAll('.browser-tab').length<${count})resolve(true);else if(Date.now()>deadline)reject(Error('Platform tab did not close'));else setTimeout(check,50)};check()})`);
      }
      if (process.env.ARARA_VIBES_TEST_ROOT) writeFileSync(join(process.env.ARARA_VIBES_TEST_ROOT, 'sharing-tabs-closed'), String(Date.now()));
      await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const deadline=Date.now()+32000;const check=()=>{if([...document.querySelectorAll('.tab-title')].some(tab=>['Codex','Claude Code'].includes(tab.textContent)))reject(Error('Closed platform reopened during polling'));else if(Date.now()>deadline)resolve(true);else setTimeout(check,250)};check()})`);
      process.stdout.write('PASS: equal sharing choices, standard platform picker, fields and close; closed platform stays closed beyond 30 seconds\n');
      const before = await window.webContents.executeJavaScript(`document.querySelectorAll('[role=tab]').length`);
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'W', modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] });
      const closed = await window.webContents.executeJavaScript(`new Promise(resolve=>{const deadline=Date.now()+5000;const check=()=>{const n=document.querySelectorAll('[role=tab]').length;if(n<${before}||Date.now()>deadline)resolve(n);else setTimeout(check,50)};check()})`);
      if (closed !== before - 1 || window.isDestroyed()) throw new Error('Shortcut did not close only the active tab');
      if (!picker.sharing || !picker.iconed || picker.badge || !picker.below || !picker.inset || picker.motion) throw new Error(`Tab picker layout failed: ${JSON.stringify(picker)}`);
      if (process.env.ARARA_VIBES_TEST_ROOT) {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(join(process.env.ARARA_VIBES_TEST_ROOT, 'logout'), '');
        const signedOutDeadline = Date.now() + 15000;
        let signedOut = false;
        while (Date.now() < signedOutDeadline && !signedOut) {
          signedOut = Boolean(await window.webContents.executeJavaScript(`!document.getElementById('signin').hidden && [...document.querySelectorAll('.surface-frame')].every(frame=>frame.hidden)`));
          if (!signedOut) await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (!signedOut) throw new Error('Logged out companion did not show sign in');
        await writeFile(join(process.env.ARARA_VIBES_TEST_ROOT, 'login'), '');
      }
      const removedControls = await window.webContents.executeJavaScript(`!!document.querySelector('#new-chat,#pin')`);
      const singleTabDrag = await window.webContents.executeJavaScript(`document.querySelectorAll('.browser-tab').length===1&&document.querySelector('.browser-tab').draggable`);
      if (removedControls || singleTabDrag || !window.isAlwaysOnTop()) throw new Error('Header controls or permanent pinning failed');
      const controls = await window.webContents.executeJavaScript(`({workspace:!!document.querySelector('#workspaces'),icons:[...document.querySelectorAll('#titlebar .window-actions button')].every(button=>button.querySelector('svg')&&button.getAttribute('aria-label')),overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth})`);
      if (controls.workspace || !controls.icons || controls.overflow) throw new Error('Companion layout failed');
      process.stdout.write('PASS: Vibes automatically started its host and rendered the original chat with icon controls\n');
      app.quit(); return;
    }
    if (smoke) {
      if (!await window.webContents.executeJavaScript("typeof window.araraVibes?.action === 'function'")) throw new Error('Native action bridge did not load');
      const branding = await window.webContents.executeJavaScript(`(async()=>{const images=[...document.images];await Promise.all(images.map(image=>image.decode()));const response=await fetch('logo-animated.svg');const animated=await response.text();return{loaded:images.every(image=>image.naturalWidth>0),gold:animated.includes('#f5cc64'),animated:response.ok&&animated.includes('@keyframes arara-contour'),brand:document.getElementById('brand-logo').getAttribute('src')}})()`);
      if (!branding.loaded || !branding.gold || !branding.animated || branding.brand !== 'logo.svg') throw new Error('Packaged gold branding or animated splash is missing');
      process.stdout.write('PASS: gold application branding and animated splash loaded from packaged assets\n');
      if (process.argv.includes('--production')) {
        if (!app.commandLine.hasSwitch('no-sandbox')) throw new Error('Required startup flag missing');
        if (process.env.ARARA_AI_EXTENSION_PATH) {
          const { readFile } = await import('node:fs/promises');
          const manifest = JSON.parse(await readFile(join(process.env.ARARA_AI_EXTENSION_PATH, 'package.json'), 'utf8'));
          if (manifest.araraEnvironment !== 'production') throw new Error('Production extension was not prepared');
        }
        process.stdout.write('PASS: startup flags --no-sandbox --production\n');
      }
      await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const deadline=Date.now()+10000;const check=()=>{if(document.documentElement.dataset.ready==='true'&&getComputedStyle(document.querySelector('#titlebar')).display==='flex')resolve(true);else if(Date.now()>deadline)reject(Error('Shell not ready'));else setTimeout(check,50)};check()})`);
      if (process.platform === 'darwin' && process.env.ARARA_VIBES_EXPECT_GLASS === '1') {
        const enabled = await window.webContents.executeJavaScript(`new Promise(resolve=>{const deadline=Date.now()+5000;const check=()=>{if(document.documentElement.dataset.glass==='true'&&getComputedStyle(document.body).backgroundColor==='rgba(0, 0, 0, 0)')resolve(true);else if(Date.now()>deadline)resolve(false);else setTimeout(check,50)};check()})`);
        if (!glass || !enabled) throw new Error('Native glass did not initialize');
        process.stdout.write('PASS: native glass initialized and shell background is transparent\n');
      }
      await run('expand');
      if (!window.isAlwaysOnTop() || window.getBounds().height !== 44) throw new Error('Window controls failed');
      await run('expand');
      if (process.platform === 'darwin') {
        const asset = nativeImage.createFromPath(resolve(__dirname, TRAY_ASSETS.image));
        const pixels = asset.toBitmap(); const tones = new Set<number>(); let transparent = false;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          if (pixels[offset + 3] === 0) { transparent = true; continue; }
          if (pixels[offset] !== pixels[offset + 1] || pixels[offset] !== pixels[offset + 2]) throw new Error('Menu bar icon must be monochrome');
          if (pixels[offset + 3] === 255) tones.add(pixels[offset]);
        }
        if (asset.isEmpty() || asset.isTemplateImage() || !transparent || tones.size < 2) throw new Error('White gradient menu bar icon is invalid');
        createTray();
        if (!tray || tray.isDestroyed()) throw new Error('Menu bar tray did not initialize');
        tray.destroy(); tray = undefined;
        process.stdout.write('PASS: macOS menu bar uses a white gradient with transparency and a Retina asset\n');
      }
      process.stdout.write('PASS: Arara Vibes rendered with CSS, isolated renderer and working window controls\n');
      app.quit(); return;
    }
    Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([
      { label: 'Arara Vibes', submenu: [{ role: 'about', label: t('About Arara Vibes') }, { type: 'separator' }, { role: 'hide', label: t('Hide Arara Vibes') }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit', label: t('Quit') }] },
      { role: 'editMenu' },
    ]) : null);
    applyShowInBar(preferences.showInBar);
    registerShortcut(preferences.shortcut);

  }).catch(error => { process.stderr.write(`Arara Vibes: ${error instanceof Error ? error.message : 'Startup failed'}\n`); app.exit(1); });
}
app.on('activate', show);
app.on('before-quit', event => {
  quitting = true;
  if (background && !hostStopped) {
    event.preventDefault(); abort.abort();
    stopping ??= (async () => {
      try { await server?.shutdown(); }
      finally {
        try { await background?.stop(); }
        finally { hostStopped = true; server?.close(); app.quit(); }
      }
    })();
    void stopping.catch(error => process.stderr.write(`Arara Vibes: ${error instanceof Error ? error.message : 'Shutdown failed'}\n`));
    return;
  }
  abort.abort(); server?.close(); globalShortcut.unregisterAll(); tray?.destroy();
});
app.on('window-all-closed', () => {});
