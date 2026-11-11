import { ipcMain, type WebContents } from 'electron';
import { ACTION_CHANNEL, type ShellReply } from '../transport';

export function registerShellBridge(contents: WebContents, url: string, dispatch: (input: unknown) => Promise<ShellReply>) {
  ipcMain.handle(ACTION_CHANNEL, (event, input: unknown) => {
    if (event.sender !== contents || event.senderFrame !== contents.mainFrame || event.senderFrame.url !== url) return { status: 403, result: null };
    return dispatch(input);
  });
  contents.once('destroyed', () => ipcMain.removeHandler(ACTION_CHANNEL));
}
