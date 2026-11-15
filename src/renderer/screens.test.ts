import { expect, it, vi } from 'vitest';
import { ScreenSwitcher, visibleScreen, type ScreenState } from './screens';

const none = { loading: false, update: false, onboarding: false, recover: false, signin: false };

it('shows a single screen by priority and falls back to the chat', () => {
  expect(visibleScreen(none)).toBe('chat');
  expect(visibleScreen({ ...none, signin: true, recover: true })).toBe('recover');
  expect(visibleScreen({ ...none, signin: true, update: true, onboarding: true })).toBe('update');
  expect(visibleScreen({ ...none, update: true, loading: true })).toBe('loading');
});

function harness(duration = 200) {
  const states: ScreenState[] = [];
  let pending: (() => void) | undefined;
  const schedule = vi.fn((callback: () => void) => { pending = callback; return 1 as unknown as ReturnType<typeof setTimeout>; });
  const cancel = vi.fn();
  const switcher = new ScreenSwitcher(state => states.push(state), () => duration, schedule, cancel);
  return { states, switcher, schedule, cancel, flush: () => { const run = pending; pending = undefined; run?.(); } };
}

it('fades the previous screen out before the next one fades in', () => {
  const h = harness();
  h.switcher.show('loading');
  h.switcher.show('recover');
  expect(h.states).toEqual([{ target: 'loading', shown: 'loading' }, { target: 'recover' }]);
  expect(h.schedule).toHaveBeenCalledWith(expect.any(Function), 200);
  h.flush();
  expect(h.states.at(-1)).toEqual({ target: 'recover', shown: 'recover' });
});

it('retargets during the fade without overlapping two screens', () => {
  const h = harness();
  h.switcher.show('chat'); h.switcher.show('update'); h.switcher.show('signin');
  expect(h.schedule).toHaveBeenCalledTimes(1);
  expect(h.states.filter(state => state.shown)).toEqual([{ target: 'chat', shown: 'chat' }]);
  h.flush();
  expect(h.states.at(-1)).toEqual({ target: 'signin', shown: 'signin' });
  h.switcher.show('signin');
  expect(h.states).toHaveLength(4);
});

it('switches immediately with animations off and cancels pending work on dispose', () => {
  const off = harness(0);
  off.switcher.show('loading'); off.switcher.show('chat');
  expect(off.states).toEqual([{ target: 'loading', shown: 'loading' }, { target: 'chat', shown: 'chat' }]);
  expect(off.schedule).not.toHaveBeenCalled();
  const on = harness();
  on.switcher.show('loading'); on.switcher.show('chat'); on.switcher.dispose();
  expect(on.cancel).toHaveBeenCalledTimes(1);
});

it('uses the platform timers with their global receiver by default', async () => {
  const states: ScreenState[] = [];
  const switcher = new ScreenSwitcher(state => states.push(state), () => 1);
  switcher.show('loading'); switcher.show('chat');
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(states.at(-1)).toEqual({ target: 'chat', shown: 'chat' });
});
