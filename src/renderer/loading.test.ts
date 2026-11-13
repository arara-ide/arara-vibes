import { afterEach, expect, it, vi } from 'vitest';
import { Loading } from './loading';

afterEach(() => { vi.useRealTimers(); });

it('keeps the startup logo for two seconds when the destination is ready immediately', () => {
  vi.useFakeTimers();
  const show = vi.fn(), failed = vi.fn();
  const loading = new Loading(show, failed);
  loading.set(false);
  vi.advanceTimersByTime(1999);
  expect(show).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(show).toHaveBeenCalledExactlyOnceWith(false);
  vi.advanceTimersByTime(20000);
  expect(failed).not.toHaveBeenCalled();
});

it('preserves the startup deadline across repeated updates and subsequent loading', () => {
  vi.useFakeTimers();
  const show = vi.fn();
  const loading = new Loading(show, vi.fn());
  loading.set(true);
  vi.advanceTimersByTime(1500);
  loading.set(false);
  vi.advanceTimersByTime(400);
  loading.set(false);
  vi.advanceTimersByTime(100);
  expect(show.mock.calls).toEqual([[true], [false]]);
  loading.set(true);
  loading.set(false);
  expect(show.mock.calls).toEqual([[true], [false], [true], [false]]);
});

it('shows a failure after twenty seconds and cancels it when loading finishes', () => {
  vi.useFakeTimers();
  const show = vi.fn(), failed = vi.fn();
  const loading = new Loading(show, failed);
  loading.set(true);
  vi.advanceTimersByTime(20000);
  expect(show.mock.calls).toEqual([[true], [false]]);
  expect(failed).toHaveBeenCalledOnce();
  loading.set(true);
  vi.advanceTimersByTime(1000);
  loading.set(false);
  vi.advanceTimersByTime(20000);
  expect(failed).toHaveBeenCalledOnce();
});

it.each([true, false])('cancels pending loading work on disposal (%s)', active => {
  vi.useFakeTimers();
  const show = vi.fn(), failed = vi.fn();
  const loading = new Loading(show, failed);
  loading.set(active);
  show.mockClear();
  loading.dispose();
  vi.advanceTimersByTime(25000);
  expect(show).not.toHaveBeenCalled();
  expect(failed).not.toHaveBeenCalled();
});
