import { expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { updateStatus } from './updates';

it.each(['en', 'pt', 'es'])('localizes every update status and distinguishes failures in %s', locale => {
  setLocale(locale);
  const statuses = ['checking', 'current', 'available', 'downloading', 'ready', 'installing', 'restarting', 'development', 'error'] as const;
  for (const status of statuses) expect(updateStatus({ product: 'arara-code', status, latest: '1.135.07430' })).not.toBe(status);
  expect(updateStatus({ product: 'arara-code', status: 'available', latest: '1.135.07430' })).toContain('1.135.07430');
  expect(updateStatus({ product: 'arara-code', status: 'error', error: 'check' })).not.toBe(updateStatus({ product: 'arara-code', status: 'error', error: 'install' }));
  setLocale('en');
});
