import { app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, Menu, nativeImage, protocol, net } from 'electron';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import Module from 'node:module';
import { createVscodeShim, type VscodeInstance } from '../shim/vscode';
import { Configuration } from '../shim/configuration';
import { jsonStore } from '../shim/jsonStore';
import { ExtensionContext } from '../shim/context';
import { Memento } from '../shim/memento';
import { Secrets } from '../shim/secrets';
import { Uri } from '../shim/uri';
import { t, setLocale } from '../i18n';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isPinned = true;
let isExpanded = true;
let vscodeInstance: VscodeInstance | null = null;

const EXPANDED_HEIGHT = 600;
const COLLAPSED_HEIGHT = 44;
const WINDOW_WIDTH = 700;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vscode-file',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

function getMediaDir(): string {
  const localMedia = resolve(app.getAppPath(), '../arara-ai/media');
  if (existsSync(localMedia)) return localMedia;
  const packagedMedia = resolve(app.getAppPath(), 'media');
  if (existsSync(packagedMedia)) return packagedMedia;
  return resolve(app.getAppPath(), 'node_modules/arara-ai/media');
}

function getExtensionPath(): string {
  const localDist = resolve(app.getAppPath(), '../arara-ai/dist/extension.js');
  if (existsSync(localDist)) return localDist;
  const packagedDist = resolve(app.getAppPath(), 'dist/extension.js');
  if (existsSync(packagedDist)) return packagedDist;
  return resolve(app.getAppPath(), 'extension.js');
}

function setupProtocol() {
  const mediaDir = getMediaDir();
  protocol.handle('vscode-file', request => {
    const parsed = new URL(request.url);
    let filePath = decodeURIComponent(parsed.pathname);
    if (!existsSync(filePath)) {
      filePath = join(mediaDir, filePath.replace(/^\/+/, ''));
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function initVscodeShim(): VscodeInstance {
  const userData = app.getPath('userData');
  const config = new Configuration(jsonStore(join(userData, 'config.json')), {
    'arara.apiUrl': 'https://api.code.app.br',
  });
  const vscode = createVscodeShim(config, process.cwd());
  vscode.env.language = app.getLocale();
  setLocale(app.getLocale());

  const origLoad = (Module as unknown as { _load: (req: string, parent: unknown, isMain: boolean) => unknown })._load;
  (Module as unknown as { _load: (req: string, parent: unknown, isMain: boolean) => unknown })._load = function (
    req: string,
    parent: unknown,
    isMain: boolean,
  ) {
    if (req === 'vscode') return vscode;
    return origLoad.apply(this, [req, parent, isMain]);
  };

  return vscode;
}

async function activateAraraExtension(vscode: VscodeInstance) {
  const extPath = getExtensionPath();
  if (!existsSync(extPath)) {
    return;
  }

  const userData = app.getPath('userData');
  const storageDir = join(userData, 'storage');
  const context = new ExtensionContext(
    Uri.file(resolve(extPath, '..', '..')),
    Uri.file(join(storageDir, 'global')),
    Uri.file(join(storageDir, 'logs')),
    Uri.file(join(storageDir, 'workspace')),
    new Memento(jsonStore(join(storageDir, 'wsState.json'))),
    new Memento(jsonStore(join(storageDir, 'globalState.json'))),
    new Secrets(jsonStore(join(storageDir, 'secrets.json'))),
    {
      id: 'arara.arara-ai',
      packageJSON: {
        name: 'arara-ai',
        version: '0.0.1',
        araraEnvironment: 'production',
      },
    },
  );

  const ext = (await import(pathToFileURL(extPath).toString())) as {
    activate: (ctx: unknown) => Promise<void>;
  };
  await ext.activate(context);
}

function buildShellHtml(chatHtml: string): string {
  const headerHtml = `
  <div id="vibes-shell-bar">
    <div class="vibes-brand">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 17L12 22L22 17" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 12L12 17L22 12" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="vibes-title">${t('Arara Vibes')}</span>
    </div>
    <div class="vibes-actions">
      <button id="vibes-btn-pin" class="vibes-btn" type="button" title="${t('Always on top')}">📌</button>
      <button id="vibes-btn-toggle" class="vibes-btn" type="button" title="${t('Collapse')}">↕</button>
      <button id="vibes-btn-close" class="vibes-btn" type="button" title="${t('Close')}">✕</button>
    </div>
  </div>
  `;

  const shellStyles = `
  <style>
    :root {
      --vibes-bar-height: 40px;
    }
    html, body {
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: #18181b !important;
      color: #f4f4f5 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      user-select: none;
      border-radius: 12px;
      border: 1px solid #27272a;
    }
    #vibes-shell-bar {
      height: var(--vibes-bar-height);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      background: #18181b;
      border-bottom: 1px solid #27272a;
      -webkit-app-region: drag;
      cursor: grab;
    }
    .vibes-brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .vibes-title {
      font-size: 13px;
      font-weight: 600;
      color: #f4f4f5;
      letter-spacing: -0.01em;
    }
    .vibes-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      -webkit-app-region: no-drag;
    }
    .vibes-btn {
      background: transparent;
      border: none;
      color: #a1a1aa;
      font-size: 12px;
      width: 24px;
      height: 24px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .vibes-btn:hover {
      background: #27272a;
      color: #f4f4f5;
    }
    .vibes-btn.active {
      color: #38bdf8;
      background: #0c4a6e44;
    }
    #app {
      height: calc(100vh - var(--vibes-bar-height)) !important;
      display: flex;
      flex-direction: column;
    }
    body.vibes-collapsed #app {
      display: none !important;
    }
  </style>
  <script>
    window.addEventListener('DOMContentLoaded', () => {
      const pinBtn = document.getElementById('vibes-btn-pin');
      const toggleBtn = document.getElementById('vibes-btn-toggle');
      const closeBtn = document.getElementById('vibes-btn-close');

      pinBtn?.addEventListener('click', () => {
        window.vibes?.togglePin();
      });

      toggleBtn?.addEventListener('click', () => {
        window.vibes?.toggleExpand();
      });

      closeBtn?.addEventListener('click', () => {
        window.vibes?.hide();
      });

      window.vibes?.onState(state => {
        if (pinBtn) pinBtn.classList.toggle('active', state.pinned);
        if (toggleBtn) toggleBtn.setAttribute('title', state.expanded ? '${t('Collapse')}' : '${t('Expand chat')}');
        document.body.classList.toggle('vibes-collapsed', !state.expanded);
      });
    });
  </script>
  `;

  if (chatHtml.includes('<body')) {
    return chatHtml.replace(/<body([^>]*)>/, `<body$1>${headerHtml}`).replace('</head>', `${shellStyles}</head>`);
  }
  return `<!doctype html><html><head>${shellStyles}</head><body>${headerHtml}<div id="app">${chatHtml}</div></body></html>`;
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;
  const x = Math.round((screenWidth - WINDOW_WIDTH) / 2);
  const y = 20;

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: EXPANDED_HEIGHT,
    x,
    y,
    frame: false,
    alwaysOnTop: isPinned,
    resizable: true,
    skipTaskbar: false,
    backgroundColor: '#18181b',
    hasShadow: true,
    webPreferences: {
      preload: resolve(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const view = vscodeInstance?.window.resolveView('arara.chatView');
  if (view) {
    const rawHtml = view.webview.html;
    const finalHtml = buildShellHtml(rawHtml);
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(finalHtml)}`, {
      baseURLForDataURL: 'vscode-file://vscode-app/',
    });

    view.webview.onMessageToRenderer(message => {
      mainWindow?.webContents.send('vscode-message', message);
    });

    ipcMain.on('vscode-post-message', (_event, message) => {
      view.webview.receiveFromRenderer(message);
    });
  }

  if (process.argv.includes('--smoke-test')) {
    mainWindow.webContents.on('did-finish-load', () => {
      process.stdout.write('PASS: Arara Vibes initialized and loaded\n');
      setTimeout(() => app.exit(0), 100);
    });
    setTimeout(() => {
      process.stderr.write('FAIL: Smoke test timeout\n');
      app.exit(1);
    }, 10000);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function updateState() {
  if (!mainWindow) return;
  mainWindow.setAlwaysOnTop(isPinned);
  const bounds = mainWindow.getBounds();
  const newHeight = isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
  mainWindow.setBounds({ ...bounds, height: newHeight });
  mainWindow.webContents.send('vibes-state-changed', { pinned: isPinned, expanded: isExpanded });
}

function setupIpc() {
  ipcMain.handle('vibes-toggle-pin', () => {
    isPinned = !isPinned;
    updateState();
    return isPinned;
  });

  ipcMain.handle('vibes-toggle-expand', () => {
    isExpanded = !isExpanded;
    updateState();
    return isExpanded;
  });

  ipcMain.handle('vibes-hide', () => {
    mainWindow?.hide();
  });
}

function toggleWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function setupTray() {
  const icon = nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAADhJREFUOE9jZKAQMFKon2HUAAYGBoa/DAwM//7//49fDUaK/wYYRgzAZgCDkZHxH24D0A2ipAcGAPsZExk7b72cAAAAAElFTkSuQmCC',
      'base64',
    ),
  );
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: t('Show Arara Vibes'), click: () => mainWindow?.show() },
    { label: t('Hide Arara Vibes'), click: () => mainWindow?.hide() },
    { type: 'separator' },
    { label: t('Quit'), click: () => app.quit() },
  ]);
  tray.setToolTip(t('Arara Vibes'));
  tray.setContextMenu(contextMenu);
  tray.on('click', toggleWindow);
}

app.whenReady().then(async () => {
  setupProtocol();
  vscodeInstance = initVscodeShim();
  await activateAraraExtension(vscodeInstance);
  setupIpc();
  createWindow();
  setupTray();

  globalShortcut.register('CommandOrControl+Shift+Space', toggleWindow);
  globalShortcut.register('Alt+Space', toggleWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
