import en from './locales/en.json';
import pt from './locales/pt.json';
import es from './locales/es.json';

export type Locale = 'en' | 'pt' | 'es';

const catalogs: Record<Locale, Record<string, string>> = {
  en,
  pt,
  es,
};

let currentLocale: Locale = 'pt';

export function normalizeLocale(locale: string | undefined): Locale {
  if (!locale) return 'pt';
  const clean = locale.toLowerCase().replace('_', '-');
  if (clean.startsWith('pt')) return 'pt';
  if (clean.startsWith('es')) return 'es';
  return 'en';
}

export function setLocale(locale: string | undefined): void {
  currentLocale = normalizeLocale(locale);
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(message: string, ...params: (string | number)[]): string {
  const catalog = catalogs[currentLocale] ?? catalogs.en;
  let translated = catalog[message] ?? catalogs.en[message] ?? message;
  params.forEach((param, index) => {
    translated = translated.replaceAll(`{${index}}`, String(param));
  });
  return translated;
}
