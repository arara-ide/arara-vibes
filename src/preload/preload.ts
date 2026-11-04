import { contextBridge, ipcRenderer } from 'electron';

let webviewState: unknown = null;

const api = {
  postMessage: (message: unknown) => {
    ipcRenderer.send('vscode-post-message', message);
  },
  getState: () => webviewState,
  setState: (state: unknown) => {
    webviewState = state;
    return state;
  },
};

const vibes = {
  togglePin: () => ipcRenderer.invoke('vibes-toggle-pin'),
  toggleExpand: () => ipcRenderer.invoke('vibes-toggle-expand'),
  hide: () => ipcRenderer.invoke('vibes-hide'),
  onState: (callback: (state: { pinned: boolean; expanded: boolean }) => void) => {
    ipcRenderer.on('vibes-state-changed', (_e, state) => callback(state));
  },
};

contextBridge.exposeInMainWorld('acquireVsCodeApi', () => api);
contextBridge.exposeInMainWorld('vibes', vibes);

ipcRenderer.on('vscode-message', (_event, message) => {
  window.dispatchEvent(new MessageEvent('message', { data: message }));
});
