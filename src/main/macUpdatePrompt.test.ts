import { afterEach, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { macBlockedPrompt, macUpdatePrompt } from './macUpdatePrompt';

afterEach(() => setLocale('en'));

it('describes each planned installer with complete messages and no tag prefix', () => {
  const prompt = macUpdatePrompt([{ product: 'arara-code', version: '1.135.07656' }, { product: 'arara-vibes', version: 'v0.1.17628' }], false);
  expect(prompt.message).toBe('Update Arara Code and Arara Vibes?');
  expect(prompt.detail.split('\n\n')).toEqual(['Arara Code 1.135.07656 will be installed in Applications. The chat restarts when it finishes.', 'Arara Vibes 0.1.17628 will be installed in Applications and reopen automatically.']);
  expect(prompt.buttons).toEqual(['Continue', 'Cancel']);
});

it('asks to quit an open Arara Code before installing it', () => {
  const prompt = macUpdatePrompt([{ product: 'arara-code', version: '1.135.07656' }], true);
  expect(prompt.message).toBe('Update Arara Code?');
  expect(prompt.detail).toBe('Arara Code is open. Save your work and quit it: version 1.135.07656 installs as soon as it closes, then Arara Code reopens.');
});

it('translates the prompts in Portuguese and Spanish', () => {
  setLocale('pt-BR');
  expect(macUpdatePrompt([{ product: 'arara-vibes', version: 'v0.2.0' }], false)).toEqual({ message: 'Atualizar o Arara Vibes?', detail: 'O Arara Vibes 0.2.0 será instalado em Aplicativos e reaberto automaticamente.', buttons: ['Continuar', 'Cancelar'] });
  expect(macBlockedPrompt('arara-code').buttons[0]).toBe('Abrir instalador no Finder');
  expect(macBlockedPrompt('arara-vibes').detail).toBe('Abra o instalador no Finder. O Arara Vibes fecha para você arrastá-lo para Aplicativos e escolher Substituir; depois, abra-o novamente.');
  setLocale('es');
  expect(macUpdatePrompt([{ product: 'arara-code', version: '1.0.0' }], true).message).toBe('¿Actualizar Arara Code?');
  expect(macBlockedPrompt('arara-code').message).toBe('macOS bloqueó la instalación automática');
});
