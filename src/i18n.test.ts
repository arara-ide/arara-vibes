import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import pt from './locales/pt.json';
import es from './locales/es.json';
import { t, setLocale, normalizeLocale } from './i18n';

describe('i18n', () => {
  it('has identical keys across en, pt, es', () => {
    const enKeys = Object.keys(en).sort();
    const ptKeys = Object.keys(pt).sort();
    const esKeys = Object.keys(es).sort();
    expect(ptKeys).toEqual(enKeys);
    expect(esKeys).toEqual(enKeys);
  });

  it('normalizes locales correctly', () => {
    expect(normalizeLocale(undefined)).toBe('en');
    expect(normalizeLocale('pt-BR')).toBe('pt');
    expect(normalizeLocale('pt_PT')).toBe('pt');
    expect(normalizeLocale('es-419')).toBe('es');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('de')).toBe('en');
  });

  it('translates messages with parameters', () => {
    setLocale('pt');
    expect(t('Always on top')).toBe('Sempre no topo');
    setLocale('es');
    expect(t('Always on top')).toBe('Siempre visible');
    setLocale('en');
    expect(t('Always on top')).toBe('Always on top');
  });
});
