import { expect, it } from 'vitest';
import { setLocale, t } from '../i18n';
import { updateStatus, updatesCurrent } from './updates';

it.each(['en', 'pt', 'es'])('localizes every update status and distinguishes failures in %s', locale => {
  setLocale(locale);
  const statuses = ['checking', 'current', 'available', 'store', 'downloading', 'ready', 'installing', 'restarting', 'development', 'error'] as const;
  for (const status of statuses) expect(updateStatus({ product: 'arara-code', status, latest: '1.135.07430' })).not.toBe(status);
  expect(updateStatus({ product: 'arara-code', status: 'available', latest: '1.135.07430' })).toContain('1.135.07430');
  expect(updateStatus({ product: 'arara-vibes', status: 'ready', command: "sudo apt install '/tmp/a.deb'" })).not.toBe(updateStatus({ product: 'arara-vibes', status: 'ready' }));
  expect(updateStatus({ product: 'arara-code', status: 'error', error: 'check' })).not.toBe(updateStatus({ product: 'arara-code', status: 'error', error: 'install' }));
  expect(updateStatus({ product: 'arara-code', status: 'error', error: 'install', store: true })).toBe(t('Could not open Microsoft Store. Open its Library to update the app.'));
  setLocale('en');
});

it.each([
  ['en', 'Check', 'Later', 'Continue'],
  ['pt-BR', 'Verificar', 'Mais tarde', 'Continuar'],
  ['es-MX', 'Buscar', 'Más tarde', 'Continuar'],
])('uses concise update actions in %s', (locale, check, later, proceed) => {
  setLocale(locale);
  expect(t('Check')).toBe(check);
  expect(t('Later')).toBe(later);
  expect(t('Continue')).toBe(proceed);
  setLocale('en');
});

it('continues only after both products are confirmed current and checking has finished', () => {
  const products = [{ product: 'arara-code', status: 'current' }, { product: 'arara-vibes', status: 'current' }] as const;
  expect(updatesCurrent({ products: [...products], busy: false })).toBe(true);
  expect(updatesCurrent({ products: [...products], busy: true })).toBe(false);
  expect(updatesCurrent({ products: [products[0]], busy: false })).toBe(false);
  expect(updatesCurrent({ products: [], busy: false })).toBe(false);
  for (const status of ['available', 'error', 'checking', 'development'] as const) expect(updatesCurrent({ products: [products[0], { product: 'arara-vibes', status }], busy: false })).toBe(false);
});
