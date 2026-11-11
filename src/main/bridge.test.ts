import { expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import { registerShellBridge } from './bridge';
import { ACTION_CHANNEL } from '../transport';

const ipc = vi.hoisted(() => ({ handle: vi.fn(), removeHandler: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: ipc }));

it('accepts only the owning main frame at the exact shell URL and removes the channel on destruction', async () => {
  const url = 'http://127.0.0.1:1234/private/';
  const frame = { url };
  const contents = { mainFrame: frame, once: vi.fn() };
  const dispatch = vi.fn(async () => ({ status: 200, result: 'ok' }));
  registerShellBridge(contents as unknown as WebContents, url, dispatch);
  const handle = ipc.handle.mock.calls.at(-1)!;
  expect(handle[0]).toBe(ACTION_CHANNEL);
  const input = { action: 'preferences' };
  for (const event of [{ sender: {}, senderFrame: frame }, { sender: contents, senderFrame: { url } }, { sender: contents, senderFrame: null }]) {
    expect(await handle[1](event, input)).toEqual({ status: 403, result: null });
  }
  frame.url = `${url}document-child`;
  expect(await handle[1]({ sender: contents, senderFrame: frame }, input)).toEqual({ status: 403, result: null });
  expect(dispatch).not.toHaveBeenCalled();
  frame.url = url;
  expect(await handle[1]({ sender: contents, senderFrame: frame }, input)).toEqual({ status: 200, result: 'ok' });
  expect(dispatch).toHaveBeenCalledExactlyOnceWith(input);
  expect(contents.once.mock.calls[0][0]).toBe('destroyed');
  contents.once.mock.calls[0][1]();
  expect(ipc.removeHandler).toHaveBeenCalledWith(ACTION_CHANNEL);
});
