import { dialog, type BrowserWindow } from 'electron';

export interface NativePrompt { message: string; detail: string; buttons: string[] }

export async function showNativePrompt(parent: BrowserWindow | undefined, prompt: NativePrompt) {
  const options = { type: 'info' as const, message: prompt.message, detail: prompt.detail, buttons: prompt.buttons, defaultId: 0, cancelId: 1, noLink: true };
  const { response } = parent && !parent.isDestroyed() && parent.isVisible() ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
  return response === 0;
}
