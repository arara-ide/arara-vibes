import { t } from '../i18n';
import type { ProductUpdate, UpdatesState, UpdateProduct } from '../main/updates';

export function updateStatus(item: ProductUpdate): string {
  switch (item.status) {
    case 'checking': return t('Checking for updates…');
    case 'current': return t('Up to date');
    case 'available': return t('Version {0} is available.', item.latest ?? '');
    case 'downloading': return t('Downloading the update…');
    case 'ready': return item.command ? t('Run this command in a terminal to install, then reopen the app.') : t('Ready to install');
    case 'installing': return t('Installing the update. Complete any system prompts.');
    case 'restarting': return t('Restarting to finish the update…');
    case 'development': return t('Development version');
    case 'error':
      if (item.error === 'migration') return t('Close Arara Code and uninstall the old UserSetup installation while keeping your data. Then try the update again.');
      return t(item.error === 'check' ? 'Could not check for updates. Try again.' : 'Could not install the update. Close Arara Code if it is open and try again.');
  }
}

const COPY_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 3V2H2v9h1"/></svg>';
const CHECK_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>';
const COPIED_MS = 1000;

export function commandBlock(command: string, copy: (text: string) => Promise<unknown>): HTMLElement {
  const pre = document.createElement('pre'); pre.className = 'code';
  const code = document.createElement('code'); code.textContent = command;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'copy';
  const idle = () => { button.innerHTML = COPY_ICON; button.title = t('Copy command'); button.setAttribute('aria-label', t('Copy command')); };
  let timer: ReturnType<typeof setTimeout> | undefined;
  idle();
  button.onclick = () => { void copy(command).then(() => { button.innerHTML = CHECK_ICON; button.setAttribute('aria-label', t('Copied')); clearTimeout(timer); timer = setTimeout(idle, COPIED_MS); }, () => undefined); };
  pre.append(code, button); return pre;
}

export function renderUpdates(container: HTMLElement, state: UpdatesState, install: (product: UpdateProduct) => Promise<void>, copy: (text: string) => Promise<unknown> = async () => undefined) {
  container.replaceChildren(...state.products.map(item => {
    const row = document.createElement('section'); row.className = 'update-product'; row.dataset.product = item.product;
    const description = document.createElement('div');
    const title = document.createElement('h2'); title.textContent = item.product === 'arara-code' ? 'Arara Code' : 'Arara Vibes';
    const current = document.createElement('p'); current.textContent = item.current ? t('Installed: {0}', item.current) : t('Version unavailable');
    const status = document.createElement('p'); status.className = 'update-status'; status.textContent = updateStatus(item); status.setAttribute('role', 'status');
    description.append(title, current, status);
    if (item.command) description.append(commandBlock(item.command, copy));
    const button = document.createElement('button'); button.className = 'soft-btn'; button.textContent = t('Update now');
    button.setAttribute('aria-label', t('Update {0}', title.textContent));
    button.disabled = state.busy || (item.status !== 'available' && item.status !== 'error');
    button.onclick = async () => { button.disabled = true; try { await install(item.product); } catch { status.textContent = t('Could not complete the action. Try again.'); } finally { button.disabled = state.busy; } };
    row.append(description, button); return row;
  }));
}
