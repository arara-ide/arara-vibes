import { t } from '../i18n';
import type { ProductUpdate, UpdatesState, UpdateProduct } from '../main/updates';

export function updateStatus(item: ProductUpdate): string {
  switch (item.status) {
    case 'checking': return t('Checking for updates…');
    case 'current': return t('Up to date');
    case 'available': return t('Version {0} is available.', item.latest ?? '');
    case 'downloading': return t('Downloading the update…');
    case 'ready': return t('Ready to install');
    case 'installing': return t('Installing the update. Complete any system prompts.');
    case 'restarting': return t('Restarting to finish the update…');
    case 'development': return t('Development version');
    case 'error':
      if (item.error === 'migration') return t('Close Arara Code and uninstall the old UserSetup installation while keeping your data. Then try the update again.');
      return t(item.error === 'check' ? 'Could not check for updates. Try again.' : 'Could not install the update. Close Arara Code if it is open and try again.');
  }
}

export function renderUpdates(container: HTMLElement, state: UpdatesState, install: (product: UpdateProduct) => Promise<void>) {
  container.replaceChildren(...state.products.map(item => {
    const row = document.createElement('section'); row.className = 'update-product'; row.dataset.product = item.product;
    const description = document.createElement('div');
    const title = document.createElement('h2'); title.textContent = item.product === 'arara-code' ? 'Arara Code' : 'Arara Vibes';
    const current = document.createElement('p'); current.textContent = item.current ? t('Installed: {0}', item.current) : t('Version unavailable');
    const status = document.createElement('p'); status.className = 'update-status'; status.textContent = updateStatus(item); status.setAttribute('role', 'status');
    description.append(title, current, status);
    const button = document.createElement('button'); button.className = 'soft-btn'; button.textContent = t('Update now');
    button.setAttribute('aria-label', t('Update {0}', title.textContent));
    button.disabled = state.busy || (item.status !== 'available' && item.status !== 'error');
    button.onclick = async () => { button.disabled = true; try { await install(item.product); } catch { status.textContent = t('Could not complete the action. Try again.'); } finally { button.disabled = state.busy; } };
    row.append(description, button); return row;
  }));
}
