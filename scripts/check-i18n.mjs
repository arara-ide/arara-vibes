import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const en = JSON.parse(readFileSync(resolve(root, 'src/locales/en.json'), 'utf8'));
const pt = JSON.parse(readFileSync(resolve(root, 'src/locales/pt.json'), 'utf8'));
const es = JSON.parse(readFileSync(resolve(root, 'src/locales/es.json'), 'utf8'));

const enKeys = Object.keys(en).sort();
const ptKeys = Object.keys(pt).sort();
const esKeys = Object.keys(es).sort();

const diffPt = enKeys.filter(k => !pt[k]);
const diffEs = enKeys.filter(k => !es[k]);

const parameters = text => [...text.matchAll(/\{\d+\}/g)].map(match => match[0]).sort().join(',');
const invalid = [pt, es].some(catalog => Object.keys(catalog).sort().join('\n') !== enKeys.join('\n') || enKeys.some(key => parameters(catalog[key] ?? '') !== parameters(en[key])));

if (invalid || diffPt.length > 0 || diffEs.length > 0) {
  process.stderr.write(`Missing translations in pt: ${diffPt.join(', ')}\nMissing in es: ${diffEs.join(', ')}\n`);
  process.exit(1);
}

process.stdout.write(`i18n check passed: ${enKeys.length} keys in all languages.\n`);
