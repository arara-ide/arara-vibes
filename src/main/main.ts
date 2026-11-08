import { app, BrowserWindow, globalShortcut, Menu, nativeTheme, Tray, nativeImage, screen, shell, systemPreferences } from 'electron';
import { join, resolve } from 'node:path';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { startShell } from '../host/server';
import { companion } from '../host/companion';
import { setLocale, t } from '../i18n';
import { BackgroundHost, backgroundRuntime } from '../host/background';
import { CHECK_INTERVAL_MS, checkForUpdate } from './update';
import { defaultShortcut, loadPreferences, normalizePreferences, resolveLanguage, savePreferences, setLinuxAutostart, type Preferences } from './preferences';

const smoke = process.argv.includes('--smoke-test');
const integration = process.argv.includes('--integration-test');
if (smoke || integration) app.setPath('userData', mkdtempSync(join(tmpdir(), 'arara-vibes-smoke-')));
let window: BrowserWindow | undefined;
let tray: Tray | undefined;
let server: Awaited<ReturnType<typeof startShell>> | undefined;
let pinned = true;
let expanded = true;
let expandedHeight = 640;
let glass = false;
let installer: string | undefined;
let preparing: Promise<string> | undefined;
const abort = new AbortController();
const runtime = companion(__dirname);
let background: BackgroundHost | undefined;
let quitting = false;
const live = () => window && !window.isDestroyed() ? window : undefined;
const show = () => { const current = live(); if (!current) return; const wasHidden = !current.isVisible(); if (wasHidden && preferences?.splash) { void current.webContents.executeJavaScript('window.vibesSplash?.()').catch(() => undefined).finally(() => { if (!current.isDestroyed()) { current.show(); current.focus(); } }); return; } current.show(); current.focus(); };
const toggle = () => { const current = live(); if (current?.isVisible() && current.isFocused()) current.hide(); else show(); };

async function prepare() {
  if (installer) return installer;
  preparing ??= runtime.prepareCompanion('arara-code', { signal: abort.signal }).then(file => { installer = file; return file; }).finally(() => { preparing = undefined; });
  return preparing;
}
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
function loginCommand() {
  const executable = process.env.APPIMAGE ?? process.execPath;
  return [executable, ...(app.isPackaged ? [] : [app.getAppPath()]), '--hidden'];
}
function applyLaunchAtLogin(enabled: boolean) {
  if (process.platform === 'linux') { setLinuxAutostart(enabled, loginCommand()); return; }
  if (!app.isPackaged) return;
  const [path, ...args] = loginCommand();
  app.setLoginItemSettings(process.platform === 'win32' ? { openAtLogin: enabled, path, args } : { openAtLogin: enabled });
}
function trayMenu() {
  return Menu.buildFromTemplate([{ label: t('Show Arara Vibes'), click: show }, { label: t('Hide Arara Vibes'), click: () => window?.hide() }, { type: 'separator' }, { label: t('Quit'), click: () => app.quit() }]);
}
function applyShowInBar(enabled: boolean) {
  if (process.platform === 'win32') { live()?.setSkipTaskbar(!enabled); if (!tray) createTray(); return; }
  if (enabled && !tray) createTray();
  if (!enabled && tray) { tray.destroy(); tray = undefined; }
}
function createTray() {
  const icon = nativeImage.createFromPath(resolve(__dirname, 'tray.png'));
  if (icon.isEmpty()) return;
  tray = new Tray(icon.resize({ width: 18, height: 18 })); tray.setToolTip('Arara Vibes'); tray.setContextMenu(trayMenu()); tray.on('click', toggle);
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
let pendingUpdate: string | undefined;
async function watchUpdates() {
  if (!app.isPackaged || process.env.ARARA_VIBES_DISABLE_UPDATES === '1') return;
  const check = async () => { const latest = await checkForUpdate(app.getVersion()); if (latest && latest !== pendingUpdate) { pendingUpdate = latest; server?.emit({ type: 'update', latest }); } };
  void check(); setInterval(() => void check(), CHECK_INTERVAL_MS).unref();
}
async function installUpdate() {
  if (!pendingUpdate) return false;
  try {
    const file = await runtime.prepareCompanion('arara-vibes', { signal: abort.signal, root: join(app.getPath('userData'), 'updates', pendingUpdate.replace(/[^\w.-]/g, '')) });
    await shell.openPath(file); app.quit(); return true;
  } catch { server?.emit({ type: 'updateFailed' }); return false; }
}
async function updatePreferences(update?: unknown) {
  if (update === undefined) return { ...preferences, defaultShortcut: defaultShortcut() };
  const previous = preferences;
  preferences = normalizePreferences(update, preferences);
  savePreferences(preferencesFile(), preferences);
  if (previous.launchAtLogin !== preferences.launchAtLogin) try { applyLaunchAtLogin(preferences.launchAtLogin); } catch { preferences.launchAtLogin = previous.launchAtLogin; savePreferences(preferencesFile(), preferences); }
  if (previous.shortcut !== preferences.shortcut && !registerShortcut(preferences.shortcut, globalShortcut.isRegistered(previous.shortcut) ? previous.shortcut : undefined)) { preferences.shortcut = previous.shortcut; savePreferences(preferencesFile(), preferences); registerShortcut(preferences.shortcut); }
  if (previous.showInBar !== preferences.showInBar) applyShowInBar(preferences.showInBar);
  if (previous.language !== preferences.language) { setLocale(resolveLanguage(preferences.language, app.getLocale())); await server?.shutdown(); background = undefined; }
  return { ...preferences, defaultShortcut: defaultShortcut() };
}
async function run(action: string) {
  if (abort.signal.aborted) return;
  if (action === 'pin') { pinned = !pinned; window?.setAlwaysOnTop(pinned, 'floating'); }
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
    if (!background) {
      const options = backgroundRuntime(__dirname, runtime.installedCompanion('arara-code'), app.commandLine.hasSwitch('no-sandbox'), resolveLanguage(preferences.language, app.getLocale()));
      if (!options && process.env.ARARA_DISABLE_COMPANION_DOWNLOAD !== '1') {
        const file = await prepare();
        if (!abort.signal.aborted) await shell.openPath(file);
      }
      if (!options) throw new Error(t('Arara Code is being prepared. Complete installation when the installer opens.'));
      background = new BackgroundHost(options);
    }
    await background.start();
  }
}

if (!smoke && !integration && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', show);
  app.setName('Arara Vibes');
  void app.whenReady().then(async () => {
    preferences = loadPreferences(preferencesFile());
    const locale = resolveLanguage(preferences.language, app.getLocale());
    setLocale(locale);
    server = await startShell(__dirname, { run, state: () => ({ pinned, expanded, glass, update: pendingUpdate }), locale, preferences: updatePreferences, installUpdate, shortcutRecording });
    void watchUpdates();
    const area = screen.getPrimaryDisplay().workArea;
    const width = Math.min(420, area.width);
    expandedHeight = Math.min(480, area.height - 40);
    window = new BrowserWindow({ width, height: expandedHeight, minWidth: 360, minHeight: 360, maxWidth: Math.max(width, 520), maximizable: false, fullscreenable: false,
      x: area.x + Math.round((area.width - width) / 2), y: area.y + 20,
      frame: false, alwaysOnTop: true, transparent: process.platform === 'darwin', visualEffectState: 'active', backgroundColor: '#1b1d21', show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    const focused = (value: boolean) => { const current = live(); if (current) void current.webContents.executeJavaScript(`document.documentElement.dataset.focused = '${value}'`).catch(() => undefined); };
    window.on('focus', () => focused(true)); window.on('blur', () => focused(false));
    window.on('close', event => { if (!quitting) { event.preventDefault(); window?.hide(); } });
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (url !== server?.url) event.preventDefault(); });
    window.on('close', event => { if (abort.signal.aborted) return; event.preventDefault(); if (preferences.closeAction === 'quit') app.quit(); else window?.hide(); });
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
      for (let index = 0; index < 3; index++) {
        const count = await window.webContents.executeJavaScript(`document.querySelectorAll('[role=tab]').length`);
        await window.webContents.executeJavaScript(`document.querySelector('#platform-options button').click()`);
        await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const deadline=Date.now()+10000;const check=()=>{if(document.querySelectorAll('[role=tab]').length>${count})resolve(true);else if(Date.now()>deadline)reject(Error('Tab was not created'));else setTimeout(check,50)};check()})`);
      }
      const tabs = await window.webContents.executeJavaScript(`({count:document.querySelectorAll('[role=tab]').length,numbered:[...document.querySelectorAll('[role=tab]')].some(tab=>/Codex [123]/.test(tab.textContent)),frames:document.querySelectorAll('.surface-frame').length})`);
      if (tabs.count < 4 || tabs.numbered || tabs.frames < 4) throw new Error('Independent conversation tabs failed');
      const picker = await window.webContents.executeJavaScript(`(()=>{const picker=document.getElementById('tab-picker');picker.open=true;picker.dispatchEvent(new Event('toggle'));const anchor=picker.querySelector('summary').getBoundingClientRect();const panel=picker.querySelector('.picker-panel').getBoundingClientRect();const options=[...document.querySelectorAll('#platform-options button')];const result={iconed:options.every(option=>option.querySelector('.option-icon')),badge:!!document.querySelector('.model-badge'),below:panel.top>=anchor.bottom&&panel.left>=0&&panel.right<=innerWidth,inset:document.getElementById('tab-strip').getBoundingClientRect().left>0,motion:matchMedia('(prefers-reduced-motion: reduce)').matches};picker.open=false;return result})()`);
      const before = await window.webContents.executeJavaScript(`document.querySelectorAll('[role=tab]').length`);
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'W', modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] });
      const closed = await window.webContents.executeJavaScript(`new Promise(resolve=>{const deadline=Date.now()+5000;const check=()=>{const n=document.querySelectorAll('[role=tab]').length;if(n<${before}||Date.now()>deadline)resolve(n);else setTimeout(check,50)};check()})`);
      if (closed !== before - 1 || window.isDestroyed()) throw new Error('Shortcut did not close only the active tab');
      if (!picker.iconed || picker.badge || !picker.below || !picker.inset || picker.motion) throw new Error(`Tab picker layout failed: ${JSON.stringify(picker)}`);
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
      const controls = await window.webContents.executeJavaScript(`({workspace:!!document.querySelector('#workspaces'),icons:[...document.querySelectorAll('#titlebar .window-actions button')].every(button=>button.querySelector('svg')&&button.getAttribute('aria-label')),overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth})`);
      if (controls.workspace || !controls.icons || controls.overflow) throw new Error('Companion layout failed');
      process.stdout.write('PASS: Vibes automatically started its host and rendered the original chat with icon controls\n');
      app.quit(); return;
    }
    if (smoke) {
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
      await run('pin'); await run('expand');
      if (window.isAlwaysOnTop() || window.getBounds().height !== 44) throw new Error('Window controls failed');
      await run('expand');
      process.stdout.write('PASS: Arara Vibes rendered with CSS, isolated renderer and working window controls\n');
      app.quit(); return;
    }
    Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([
      { label: 'Arara Vibes', submenu: [{ role: 'about', label: t('About Arara Vibes') }, { type: 'separator' }, { role: 'hide', label: t('Hide Arara Vibes') }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit', label: t('Quit') }] },
      { role: 'editMenu' },
    ]) : null);
    applyShowInBar(preferences.showInBar);
    registerShortcut(preferences.shortcut);
    if (process.env.ARARA_DISABLE_COMPANION_DOWNLOAD !== '1' && !runtime.installedCompanion('arara-code')) {
      void prepare().then(async file => { if (!abort.signal.aborted) await shell.openPath(file); }).catch(() => server?.emit({ type: 'companionFailed' }));
    }
  }).catch(error => { process.stderr.write(`Arara Vibes: ${error instanceof Error ? error.message : 'Startup failed'}\n`); app.exit(1); });
}
app.on('activate', show);
app.on('before-quit', event => {
  quitting = true;
  if (background && !abort.signal.aborted) {
    event.preventDefault(); abort.abort();
    void server?.shutdown().finally(() => app.quit()); return;
  }
  abort.abort(); server?.close(); globalShortcut.unregisterAll(); tray?.destroy();
});
app.on('window-all-closed', () => {});
