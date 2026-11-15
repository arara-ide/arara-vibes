import { t } from '../i18n';
import type { PlannedUpdate } from './updates';

const displayVersion = (version: string) => version.replace(/^v/, '');

function planDetail(item: PlannedUpdate, codeOpen: boolean) {
  const version = displayVersion(item.version);
  if (item.product === 'arara-vibes') return t('Arara Vibes {0} will be installed in Applications and reopen automatically.', version);
  if (codeOpen) return t('Arara Code is open. Save your work and quit it: version {0} installs as soon as it closes, then Arara Code reopens.', version);
  return t('Arara Code {0} will be installed in Applications. The chat restarts when it finishes.', version);
}

export function macUpdatePrompt(plan: PlannedUpdate[], codeOpen: boolean) {
  const products = new Set(plan.map(item => item.product));
  const message = products.size > 1 ? t('Update Arara Code and Arara Vibes?') : products.has('arara-code') ? t('Update Arara Code?') : t('Update Arara Vibes?');
  return { message, detail: plan.map(item => planDetail(item, codeOpen)).join('\n\n'), buttons: [t('Continue'), t('Cancel')] };
}

export function macBlockedPrompt(product: PlannedUpdate['product']) {
  return {
    message: t('macOS blocked automatic installation'),
    detail: product === 'arara-code'
      ? t('Open the installer in Finder, drag Arara Code to Applications and choose Replace. Arara Vibes restarts the chat when the new version is in place.')
      : t('Open the installer in Finder. Arara Vibes closes so you can drag it to Applications and choose Replace, then reopen it.'),
    buttons: [t('Open installer in Finder'), t('Cancel')],
  };
}
