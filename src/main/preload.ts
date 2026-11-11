import { contextBridge, ipcRenderer } from 'electron';
import { ACTION_CHANNEL, type ShellBridge } from '../transport';

if (process.isMainFrame) contextBridge.exposeInMainWorld('araraVibes', {
  action: input => ipcRenderer.invoke(ACTION_CHANNEL, input),
} satisfies ShellBridge);
