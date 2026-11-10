import { expect, it, vi } from 'vitest';
import { updateCode } from './codeUpdate';

function harness() {
  const state = { version: '1.135.07400', clock: 0 };
  const controller = new AbortController();
  const actions = { pause: vi.fn(async () => true), install: vi.fn(async () => {}), currentVersion: () => state.version, resume: vi.fn(async () => {}), signal: controller.signal, now: () => state.clock, wait: vi.fn(async () => { state.version = '1.135.07430'; state.clock += 1000; }) };
  return { state, controller, actions };
}

it('waits for the installed version before restarting the owned host', async () => {
  const h = harness(); await updateCode('1.135.07430', h.actions);
  expect(h.actions.wait).toHaveBeenCalledOnce(); expect(h.actions.resume).toHaveBeenCalledOnce();
  expect(h.actions.pause.mock.invocationCallOrder[0]).toBeLessThan(h.actions.install.mock.invocationCallOrder[0]);
  expect(h.actions.install.mock.invocationCallOrder[0]).toBeLessThan(h.actions.resume.mock.invocationCallOrder[0]);
});

it('restores the existing host if installation is refused', async () => {
  const h = harness(); h.actions.install.mockRejectedValue(Error('Permission denied'));
  await expect(updateCode('1.135.07430', h.actions)).rejects.toThrow('Permission denied');
  expect(h.actions.resume).toHaveBeenCalledOnce(); expect(h.state.version).toBe('1.135.07400');
});

it('starts the host after installing Code for the first time', async () => {
  const h = harness(); h.actions.pause.mockResolvedValue(false);
  await updateCode('1.135.07430', h.actions); expect(h.actions.resume).toHaveBeenCalledOnce();
});

it('times out without claiming that an old or invalid installation is current', async () => {
  const h = harness(); h.state.version = 'invalid'; h.actions.wait.mockImplementation(async () => { h.state.clock += 15 * 60_000; });
  await expect(updateCode('1.135.07430', h.actions)).rejects.toThrow('timed out');
  expect(h.actions.resume).toHaveBeenCalledOnce();
});

it('respects application shutdown while the system installer is pending', async () => {
  const h = harness(); h.actions.wait.mockImplementation(async () => h.controller.abort());
  await expect(updateCode('1.135.07430', h.actions)).rejects.toThrow('cancelled');
  expect(h.actions.resume).not.toHaveBeenCalled();
});
