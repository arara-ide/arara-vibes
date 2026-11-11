import { expect, it, vi } from 'vitest';
import { requestAction } from './action';
import { setLocale, t } from '../i18n';

it('sends chat actions through the native bridge without using browser HTTP', async () => {
  const input = { action: 'message', message: { type: 'input', surface: 'chat', message: { type: 'send', text: 'draft' } } };
  const action = vi.fn(async () => ({ status: 200, result: null }));
  const fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
  await expect(requestAction(input, { action }, fetch)).resolves.toBeNull();
  expect(action).toHaveBeenCalledExactlyOnceWith(input);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['en', 'pt', 'es'])('localizes failures without retrying a possibly accepted action in %s', async locale => {
  setLocale(locale);
  const action = vi.fn(async () => { throw new Error('Internal transport error'); });
  const fetch = vi.fn();
  await expect(requestAction({ action: 'message' }, { action }, fetch)).rejects.toThrow(t('Could not complete the action. Try again.'));
  expect(action).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
  await expect(requestAction({ action: 'message' }, undefined, async () => { throw new TypeError('Failed to fetch'); })).rejects.toThrow(t('Could not complete the action. Try again.'));
  setLocale('en');
});

it('preserves HTTP preview and rejects denied native actions', async () => {
  const input = { action: 'preferences' };
  const fetch = vi.fn(async () => Response.json({ animations: true }));
  await expect(requestAction(input, undefined, fetch)).resolves.toEqual({ animations: true });
  expect(fetch).toHaveBeenCalledExactlyOnceWith('action', expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }));
  await expect(requestAction(input, { action: async () => ({ status: 403, result: null }) }, fetch)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
