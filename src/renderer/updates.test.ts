import { expect, it } from 'vitest';
import { setLocale, t } from '../i18n';
import { updateStatus } from './updates';

it.each(['en', 'pt', 'es'])('localizes every update status and distinguishes failures in %s', locale => {
  setLocale(locale);
  const statuses = ['checking', 'current', 'available', 'downloading', 'ready', 'installing', 'restarting', 'development', 'error'] as const;
  for (const status of statuses) expect(updateStatus({ product: 'arara-code', status, latest: '1.135.07430' })).not.toBe(status);
  expect(updateStatus({ product: 'arara-code', status: 'available', latest: '1.135.07430' })).toContain('1.135.07430');
  expect(updateStatus({ product: 'arara-vibes', status: 'ready', command: "sudo apt install '/tmp/a.deb'" })).not.toBe(updateStatus({ product: 'arara-vibes', status: 'ready' }));
  expect(updateStatus({ product: 'arara-code', status: 'error', error: 'check' })).not.toBe(updateStatus({ product: 'arara-code', status: 'error', error: 'install' }));
  setLocale('en');
});

it.each([
  ['en', 'Check', 'Later', 'Finish ongoing tasks before updating.'],
  ['pt-BR', 'Verificar', 'Mais tarde', 'Conclua as tarefas em andamento antes de atualizar.'],
  ['es-MX', 'Buscar', 'Más tarde', 'Finaliza las tareas en curso antes de actualizar.'],
])('uses concise update actions and instructions in %s', (locale, check, later, description) => {
  setLocale(locale);
  expect(t('Check')).toBe(check);
  expect(t('Later')).toBe(later);
  expect(t('Finish ongoing tasks before updating.')).toBe(description);
  setLocale('en');
});
