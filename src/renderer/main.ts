import { requestAction } from './action';
import type { ShellBridge } from '../transport';
import type { UpdatesState } from '../main/updates';
import { renderUpdates } from './updates';
import { Loading } from './loading';
import { t, setLocale } from '../i18n';
import { chatDocument } from './document';
import type { HostInfo } from '../host/connection';
import { tabLabel, initialSurface, needsSelection, moveTab, type Surface } from './tabs';
import { insideDragViewport, tabDropDestination, tabDragVelocity, tabDragScroll, type DragPoint } from './tabDrag';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
interface View { frame: HTMLIFrameElement; token: string; epoch: number; ready: boolean; pending: unknown[]; state?: unknown }
const views = new Map<string, View>();
let surfaces: Surface[] = [];
let hosts: HostInfo[] = [];
let selected = '';
let activeHost: HostInfo | undefined;
let connected = false;
let discovering = false;
let hostRequested = false;
let glass = false;
document.documentElement.dataset.mac = String(/Mac/.test(navigator.platform));
let requested: { id: string; preserveFocus: boolean } | undefined;
const seenTabs = new Set<string>();
let dragged: string | undefined;
let dragPreview: HTMLElement | undefined;
let dragPoint: DragPoint | undefined;
let dragFrame = 0;
let dragAt = 0;
let dragScroll: number | undefined;
let revealedSelection = '';
const dropMarker = document.createElement('div'); dropMarker.className = 'tab-drop-marker'; dropMarker.hidden = true; dropMarker.setAttribute('aria-hidden', 'true'); document.body.append(dropMarker);

function endDrag() {
  stopDragFeedback(); dragged = undefined; dragPreview?.remove(); dragPreview = undefined;
  element('tab-strip').style.overflowX = '';
  document.querySelector('.tab-drag-source')?.classList.remove('tab-drag-source');
  renderTabs();
}

function stopDragFeedback() {
  cancelAnimationFrame(dragFrame); dragFrame = 0; dragAt = 0; dragScroll = undefined; dragPoint = undefined; dropMarker.hidden = true;
}

function dragGeometry() {
  const strip = element('tab-strip').getBoundingClientRect();
  const tabs = [...element('tabs').querySelectorAll<HTMLElement>('.browser-tab')].map(tab => ({ id: tab.dataset.surface!, ...tab.getBoundingClientRect().toJSON() })) as { id: string; left: number; right: number; top: number; bottom: number }[];
  const bounds = element('tabs').getBoundingClientRect();
  return { tabs, viewport: { left: Math.max(strip.left, bounds.left), right: Math.min(strip.right, bounds.right), top: Math.max(strip.top, bounds.top), bottom: Math.min(strip.bottom, bounds.bottom) } };
}

function updateDragFeedback() {
  if (!dragged || !dragPoint) { dropMarker.hidden = true; return; }
  const { tabs, viewport } = dragGeometry();
  const target = tabDropDestination(tabs, dragged, dragPoint, viewport);
  dropMarker.hidden = !target;
  if (!target) return;
  const width = parseFloat(getComputedStyle(dropMarker).width);
  dropMarker.style.left = `${Math.max(viewport.left, Math.min(viewport.right - width, target.left - width / 2))}px`;
  dropMarker.style.top = `${target.top}px`; dropMarker.style.height = `${target.bottom - target.top}px`;
}

function scrollDraggedTabs(now: number) {
  dragFrame = 0;
  if (!dragged || !dragPoint) return;
  const strip = element('tab-strip');
  const { viewport } = dragGeometry();
  const maxScroll = strip.scrollWidth - strip.clientWidth;
  const position = dragScroll ?? strip.scrollLeft;
  const velocity = tabDragVelocity(dragPoint, viewport, position, maxScroll);
  if (!velocity) { dragScroll = undefined; dragAt = 0; updateDragFeedback(); return; }
  dragScroll = tabDragScroll(position, velocity, dragAt ? now - dragAt : 0, maxScroll);
  strip.scrollTo({ left: dragScroll, behavior: 'instant' }); dragAt = now;
  updateDragFeedback(); dragFrame = requestAnimationFrame(scrollDraggedTabs);
}

async function reorder(id: string, before?: string) {
  const next = moveTab(surfaces, id, before);
  if (next.every((surface, index) => surface.id === surfaces[index]?.id)) return;
  await send({ type: 'reorderTabs', order: next.map(surface => surface.id) });
  surfaces = next; renderTabs();
}

async function action(action: string, extra: Record<string, unknown> = {}): Promise<unknown> {
  return requestAction({ action, ...extra }, (window as Window & { araraVibes?: ShellBridge }).araraVibes);
}
const send = (message: Record<string, unknown>) => action('message', { message });
function localize(locale: string) {
  setLocale(locale); document.documentElement.lang = locale;
  document.querySelectorAll<HTMLElement>('[data-text]').forEach(node => { node.textContent = t(node.dataset.text!); });
  document.querySelectorAll<HTMLElement>('[data-label]').forEach(node => { node.title = t(node.dataset.label!); node.setAttribute('aria-label', t(node.dataset.label!)); });
}
function feedback(text = '', error = false) {
  const node = element('feedback'); node.textContent = text; node.hidden = !text; node.dataset.error = String(error);
}
const loadingIndicator = new Loading(loading => { element('loading').dataset.off = String(!loading); }, () => feedback(t('The conversation did not load. Try again.'), true));
function busy(loading: boolean) {
  loadingIndicator.set(loading && !!element('update').hidden);
}
function reset() {
  for (const view of views.values()) view.frame.remove();
  views.clear(); surfaces = []; revealedSelection = '';
  if (dragged) endDrag();
  element<HTMLButtonElement>('history').disabled = true;
  element('conversation-actions').hidden = true;
  element<HTMLDetailsElement>('conversation-actions').open = false;
  connected = false; selected = ''; busy(false);
  element('signin').hidden = true; element('history-panel').hidden = true; element('tab-strip').hidden = true;
}
async function connect(id: string) {
  reset(); element('recover').hidden = true; activeHost = hosts.find(host => host.id === id);
  if (!activeHost?.allowed) return;
  feedback(); busy(true); localize(activeHost.locale);
  for (const [key, value] of Object.entries(activeHost.theme)) if (/^--vscode-[\w-]+$/.test(key) && /^#[a-fA-F0-9]{3,8}$/.test(value)) document.documentElement.style.setProperty(key, value);
  await action('connect', { id }); connected = true;
  if (activeHost.signedIn === false) { busy(false); element('signin').hidden = false; }
}
let startedAt = 0;
let onboarded = false;
function recover() {
  reset(); feedback(); element('loading').dataset.off = 'true'; element('recover').hidden = false;
  element<HTMLButtonElement>('retry').focus();
}
interface VibesPreferences { language: string; animations: boolean; splash: boolean; closeAction: string; shortcut: string; launchAtLogin: boolean; showInBar: boolean; onboarded: boolean }
let currentPreferences: VibesPreferences | undefined;
function applyPreferences(next: VibesPreferences) {
  const languageChanged = currentPreferences && currentPreferences.language !== next.language;
  currentPreferences = next;
  document.documentElement.dataset.motion = next.animations ? 'on' : 'off';
  if (languageChanged) location.reload();
}
async function onboarding() {
  const preferences = await action('preferences') as VibesPreferences;
  applyPreferences(preferences);
  if (preferences.onboarded) return;
  const screen = element('onboarding');
  const bar = /Mac/.test(navigator.platform) ? 'Show in the menu bar' : /Win/.test(navigator.platform) ? 'Show in the taskbar' : 'Show in the top bar';
  element('onboarding-bar-label').textContent = t(bar);
  element<HTMLInputElement>('onboarding-login').checked = true; element<HTMLInputElement>('onboarding-bar').checked = preferences.showInBar;
  element('loading').dataset.off = 'true'; screen.hidden = false; element<HTMLButtonElement>('onboarding-continue').focus();
  const button = element<HTMLButtonElement>('onboarding-continue');
  await new Promise<void>(done => {
    button.onclick = async () => {
      button.disabled = true;
      try {
        applyPreferences(await action('preferences', { preferences: { launchAtLogin: element<HTMLInputElement>('onboarding-login').checked, showInBar: element<HTMLInputElement>('onboarding-bar').checked, onboarded: true } }) as VibesPreferences);
        feedback(); screen.hidden = true; element('loading').dataset.off = 'false'; done();
      } catch { feedback(t('Could not complete the action. Try again.'), true); }
      finally { button.disabled = false; }
    };
  });
}
async function discover() {
  if (!onboarded) return;
  if (!element('recover').hidden) return;
  if (discovering) return;
  discovering = true;
  try {
    hosts = await action('discover') as HostInfo[];
    if (connected && activeHost) {
      const current = hosts.find(host => host.id === activeHost!.id);
      if (current?.signedIn && !element('signin').hidden) {
        activeHost = current; element('signin').hidden = true; element('tab-strip').hidden = false;
        const first = initialSurface(surfaces, selected || localStorage.getItem('vibes.surface'))?.id;
        for (const surface of surfaces) void loadSurface(surface.id, surface.id === first).catch(fail);
      }
      if (current?.signedIn === false && element('signin').hidden) {
        activeHost = current;
        for (const view of views.values()) { view.frame.hidden = true; view.frame.removeAttribute('src'); }
        element('signin').hidden = false; element('tab-strip').hidden = true;
      }
      return;
    }
    const host = hosts.find(item => item.allowed && item.background);
    if (host) await connect(host.id);
    else if (!hostRequested) { hostRequested = true; busy(true); startedAt = Date.now(); await action('startHost'); }
    else if (Date.now() - startedAt > 45000) recover();
  } finally { discovering = false; }
}
function activate(id: string) {
  if (!surfaces.some(surface => surface.id === id)) return;
  selected = id; localStorage.setItem('vibes.surface', id);
  for (const [key, view] of views) { view.frame.hidden = key !== id; view.frame.id = key === id ? 'chat' : ''; }
  element('history-panel').hidden = true;
  element<HTMLDetailsElement>('conversation-actions').open = false;
  const chat = surfaces.find(surface => surface.id === id)?.kind === 'ai';
  element<HTMLButtonElement>('history').disabled = !chat;
  updateConversationActions();
  busy(!views.get(id)?.ready && ![...views.values()].some(view => view.ready)); renderTabs();
}
function loadSurface(id: string, focus = true) {
  if (!views.has(id)) {
    const frame = document.createElement('iframe');
    frame.className = 'surface-frame'; frame.title = tabLabel(surfaces.find(surface => surface.id === id)!);
    frame.setAttribute('sandbox', 'allow-scripts allow-downloads'); frame.hidden = true;
    element('stage').prepend(frame);
    views.set(id, { frame, token: '', epoch: 0, ready: false, pending: [] });
  }
  views.get(id)!.ready = false;
  if (focus) activate(id);
  return send({ type: 'open', surface: id });
}

function updateConversationActions() {
  const surface = surfaces.find(surface => surface.id === selected);
  element('conversation-actions').hidden = !surface?.actions?.includes('scheduleQueue');
  refreshScheduleQueue();
}
function icon(name: string) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(svg.namespaceURI, 'use'); use.setAttribute('href', `icons.svg#${name}`); svg.append(use); return svg;
}
async function closeTab(id: string) {
  if (surfaces.length <= 1 || surfaces.find(surface => surface.id === id)?.running) return;
  await send({ type: 'close', surface: id }); await send({ type: 'removeTab', surface: id });
  document.getElementById(`tab-${id}`)?.parentElement?.classList.add('closing'); await new Promise(done => setTimeout(done, 160)); seenTabs.delete(id);
  views.get(id)?.frame.remove(); views.delete(id);
  surfaces = surfaces.filter(surface => surface.id !== id);
  if (selected === id) { selected = ''; if (surfaces[0]) activate(surfaces[0].id); else { element<HTMLDetailsElement>('tab-picker').open = true; busy(false); } }
  renderTabs();
}
function renderTabs() {
  if (dragged) return;
  if (needsSelection(surfaces, selected, !element('signin').hidden)) { activate(initialSurface(surfaces, localStorage.getItem('vibes.surface'))!.id); return; }
  element('tabs').replaceChildren(...surfaces.map((surface, index) => {
    const item = document.createElement('div'); item.className = 'browser-tab'; item.onclick = event => { if (!(event.target as Element).closest('.tab-close')) activate(surface.id); }; item.dataset.active = String(surface.id === selected); if (!seenTabs.has(surface.id)) { seenTabs.add(surface.id); item.classList.add('entering'); }
    item.dataset.surface = surface.id; item.draggable = surfaces.length > 1;
    item.ondragstart = event => {
      if (surfaces.length < 2 || !event.dataTransfer || (event.target as Element).closest('.tab-close')) { event.preventDefault(); return; }
      dragged = surface.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', surface.id);
      element('tab-strip').style.overflowX = 'hidden';
      dragPreview = item.cloneNode(true) as HTMLElement; dragPreview.classList.add('tab-drag-preview'); dragPreview.classList.remove('entering'); document.body.append(dragPreview);
      dragPreview.inert = true; dragPreview.setAttribute('aria-hidden', 'true');
      event.dataTransfer.setDragImage(dragPreview, event.offsetX, event.offsetY);
      requestAnimationFrame(() => { if (dragged === surface.id) item.classList.add('tab-drag-source'); });
    };
    item.ondragend = endDrag;
    const button = document.createElement('button'); button.className = 'tab-title'; button.role = 'tab'; button.id = `tab-${surface.id}`;
    button.setAttribute('aria-selected', String(surface.id === selected)); button.tabIndex = surface.id === selected ? 0 : -1;
    button.textContent = tabLabel(surface); button.title = button.textContent; button.onclick = () => activate(surface.id);
    button.onkeydown = event => {
      if (event.altKey && event.shiftKey && ['ArrowLeft', 'ArrowRight'].includes(event.key) && surfaces.length > 1) {
        event.preventDefault(); const target = event.key === 'ArrowLeft' ? surfaces[Math.max(0, index - 1)]?.id : surfaces[index + 2]?.id;
        void reorder(surface.id, target).then(() => document.getElementById(`tab-${surface.id}`)?.focus()).catch(fail); return;
      }
      const next = event.key === 'ArrowRight' ? (index + 1) % surfaces.length : event.key === 'ArrowLeft' ? (index + surfaces.length - 1) % surfaces.length : event.key === 'Home' ? 0 : event.key === 'End' ? surfaces.length - 1 : -1;
      if (next >= 0) { event.preventDefault(); activate(surfaces[next].id); document.getElementById(`tab-${surfaces[next].id}`)?.focus(); }
    };
    const close = document.createElement('button'); close.className = 'icon-btn tab-close'; close.append(icon('close'));
    close.title = t('Close tab'); close.setAttribute('aria-label', t('Close {0}', tabLabel(surface))); close.disabled = !!surface.running;
    close.hidden = surfaces.length <= 1; close.onclick = () => { void closeTab(surface.id).catch(fail); };
    item.append(button, close); return item;
  }));
  if (selected !== revealedSelection) {
    element('tabs').querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    revealedSelection = selected;
  }
}
function dragOver(event: DragEvent) {
  if (!dragged || surfaces.length < 2) return;
  dragPoint = { x: event.clientX, y: event.clientY };
  if (!insideDragViewport(dragPoint, dragGeometry().viewport)) { stopDragFeedback(); return; }
  event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  updateDragFeedback();
  if (!dragFrame) dragFrame = requestAnimationFrame(scrollDraggedTabs);
}
document.addEventListener('dragenter', dragOver);
document.addEventListener('dragover', dragOver);
document.addEventListener('dragleave', event => {
  if (!dragged) return;
  if (!insideDragViewport({ x: event.clientX, y: event.clientY }, dragGeometry().viewport)
    || event.relatedTarget instanceof Node && !element('tab-strip').contains(event.relatedTarget)) stopDragFeedback();
});
addEventListener('blur', stopDragFeedback);
addEventListener('resize', stopDragFeedback);
document.addEventListener('drop', event => {
  if (!dragged) return;
  event.preventDefault(); const id = dragged;
  const { tabs, viewport } = dragGeometry();
  const target = tabDropDestination(tabs, id, { x: event.clientX, y: event.clientY }, viewport);
  endDrag(); if (target) void reorder(id, target.before).catch(fail);
});
function optionIcon(entry: { id: string; icon?: string }) {
  if (entry.id === 'browser' || entry.id === 'sharing' || entry.id === 'settings') { const svg = icon(entry.id === 'browser' ? 'globe' : entry.id === 'sharing' ? 'sign-in' : 'gear'); svg.classList.add('option-icon'); return svg; }
  const glyph = document.createElement('span'); glyph.className = 'option-icon platform-glyph'; glyph.setAttribute('aria-hidden', 'true');
  if (entry.icon?.startsWith('data:image/svg+xml')) glyph.style.setProperty('--glyph', `url("${entry.icon}")`); return glyph;
}
function renderOptions(platforms: { id: string; label: string; icon?: string }[]) {
  const entries = [...platforms, { id: 'browser', label: t('Browser') }, { id: 'sharing', label: t('Share limits') }, { id: 'settings', label: t('Settings') }];
  element('platform-options').replaceChildren(...entries.map(entry => {
    const button = document.createElement('button'); button.className = 'model-option'; button.dataset.platform = entry.id; button.role = 'menuitem';
    const label = document.createElement('span'); label.textContent = entry.label; button.append(optionIcon(entry), label);
    button.onclick = async () => {
      button.disabled = true;
      try { await send({ type: 'createTab', platform: entry.id }); element<HTMLDetailsElement>('tab-picker').open = false; }
      catch (error) { fail(error); } finally { button.disabled = false; }
    };
    return button;
  }));
}
function receive(event: Record<string, unknown>) {
  if (event.type === 'openUpdates') { openUpdates(); return; }
  if (event.type === 'shell' && typeof event.locale === 'string' && !activeHost) localize(event.locale);
  if ((event.type === 'shell' || event.type === 'updates') && event.updates) {
    updatesState = event.updates as UpdatesState;
    if (!updatesDismissed && updatesState.products.some(item => item.status === 'available')) openUpdates();
    drawUpdates();
    if (event.type === 'updates') return;
  }
  if (event.type === 'preferences') { applyPreferences(event.preferences as VibesPreferences); return; }
  if (event.type === 'shell') {
    glass = event.glass === true; document.documentElement.dataset.glass = String(glass);
    element('expand').setAttribute('aria-expanded', String(event.expanded));
    element('expand').title = t(event.expanded ? 'Collapse' : 'Expand chat'); element('expand').setAttribute('aria-label', element('expand').title);
    element('expand').querySelector('use')?.setAttribute('href', `icons.svg#chevron-${event.expanded ? 'up' : 'down'}`);
    document.body.dataset.expanded = String(event.expanded); return;
  }
  if (event.type === 'disconnected') { reset(); hostRequested = false; busy(true); void discover().catch(fail); return; }
  if (event.type === 'openSurface' && typeof event.surface === 'string') {
    requested = { id: event.surface, preserveFocus: event.preserveFocus === true };
    if (surfaces.some(surface => surface.id === event.surface)) { if (!requested.preserveFocus) activate(requested.id); requested = undefined; }
    return;
  }
  if (event.type === 'hello') {
    surfaces = (event.surfaces as Surface[]).filter(surface => surface.tab !== false);
    updateConversationActions();
    renderOptions((event.platforms ?? []) as { id: string; label: string; icon?: string }[]);
    element('tab-strip').hidden = activeHost?.signedIn === false;
    const initial = requested && surfaces.some(surface => surface.id === requested!.id) ? requested : { id: initialSurface(surfaces, selected || localStorage.getItem('vibes.surface'))?.id ?? '', preserveFocus: false };
    if (activeHost?.signedIn !== false && !surfaces.length) { busy(true); void send({ type: 'ensureTab' }).catch(fail); }
    if (activeHost?.signedIn !== false) {
      for (const surface of surfaces) if (!views.has(surface.id)) void loadSurface(surface.id, false).catch(fail);
      if (initial.id && (!initial.preserveFocus || !selected)) activate(initial.id);
    }
    requested = undefined; renderTabs(); return;
  }
  const view = typeof event.surface === 'string' ? views.get(event.surface) : undefined;
  if (event.type === 'document' && view) {
    view.token = crypto.randomUUID(); view.epoch = Number(event.epoch); view.ready = false; view.pending = [];
    const token = view.token;
    void action('document', { key: event.surface, html: chatDocument(String(event.html), token, activeHost?.theme ?? {}, view.state, glass, document.documentElement.dataset.motion !== 'off') }).then(path => { if (view.token === token) view.frame.src = String(path); }).catch(fail); return;
  }
  if (event.type === 'event' && view && event.epoch === view.epoch) {
    const message = event.message as { type?: string };
    if (!view.ready) view.pending.push(message); else view.frame.contentWindow?.postMessage({ type: 'event', token: view.token, message }, '*');
    if (event.surface === selected && ['done', 'live', 'state', 'browserState', 'view'].includes(message.type ?? '')) busy(false);
    return;
  }
  if (event.type === 'error') { busy(false); feedback(typeof event.text === 'string' ? event.text : t('Could not complete the action. Try again.'), true); }
  if (event.type === 'history') {
    const list = element('conversations');
    const items = event.conversations as { id: string; title: string; surface: string; hasMessages?: boolean }[];
    list.replaceChildren(...items.filter(item => item.hasMessages !== false).slice(0, 5).map(item => {
      const button = document.createElement('button'); button.className = 'conversation'; button.textContent = item.title;
      button.onclick = () => { activate(item.surface); busy(true); void send({ type: 'conversation', surface: item.surface, id: item.id }).catch(fail); }; return button;
    }));
    if (!list.childElementCount) list.textContent = t('No conversations yet.');
    element('history-panel').hidden = false;
  }
}
function fail(error: unknown) {
  if (!connected || !surfaces.length) { recover(); return; }
  busy(false); feedback(error instanceof Error ? error.message : t('Could not complete the action. Try again.'), true); }
addEventListener('message', event => {
  const entry = [...views].find(([, view]) => event.source === view.frame.contentWindow && view.token && event.data?.token === view.token);
  if (!entry) return;
  const [id, view] = entry;
  if (event.data.type === 'ready') {
    view.ready = true;
    for (const message of view.pending) view.frame.contentWindow?.postMessage({ type: 'event', token: view.token, message }, '*');
    view.pending = []; if (id === selected) busy(false);
  }
  if (event.data.type === 'state') view.state = event.data.state;
  if (event.data.type === 'input' && (event.data.message as { type?: string } | undefined)?.type === 'vibesShortcutRecording') { void action('shortcutRecording', { recording: (event.data.message as { recording?: unknown }).recording === true }).catch(fail); return; }
  if (event.data.type === 'input' && (event.data.message as { type?: string } | undefined)?.type === 'vibesPreferences') {
    const frame = view.frame; const token = view.token;
    void action('preferences', { preferences: (event.data.message as { preferences?: unknown }).preferences }).then(preferences => frame.contentWindow?.postMessage({ type: 'event', token, message: { type: 'vibesPreferences', preferences } }, '*')).catch(fail);
    return;
  }
  if (event.data.type === 'input') void send({ type: 'input', surface: id, message: event.data.message }).catch(fail);
  if (event.data.type === 'escape') void action('hide').catch(fail);
});
function bind(id: string, run: () => Promise<unknown>, disabled: () => boolean = () => false) {
  const button = element<HTMLButtonElement>(id);
  let running = false;
  const refresh = () => { button.disabled = running || disabled(); };
  button.onclick = async () => {
    if (running || disabled()) return;
    running = true; refresh();
    try { await run(); } catch (error) { fail(error); } finally { running = false; refresh(); }
  };
  return refresh;
}
bind('expand', () => action('expand')); bind('hide', () => action('hide'));
bind('retry', async () => { element('recover').hidden = true; hostRequested = false; connected = false; activeHost = undefined; busy(true); await discover(); });
bind('sign-in-copy', async () => { await action('copySignInLink'); feedback(t('Sign-in link copied. Paste it in your browser.')); });
let updatesState: UpdatesState = { products: [], busy: false };
let updatesDismissed = false;
function drawUpdates() {
  renderUpdates(element('update-products'), updatesState, async product => { await action('installUpdate', { product }); }, text => action('copyText', { text }));
  element('update-text').textContent = t('Finish ongoing tasks before updating.');
  element<HTMLButtonElement>('update-install').disabled = updatesState.busy || !updatesState.products.some(item => item.status === 'available');
  element<HTMLButtonElement>('update-check').disabled = updatesState.busy;
  element<HTMLButtonElement>('update-close').disabled = updatesState.busy;
}
function openUpdates() {
  document.documentElement.dataset.update = 'true';
  element('update').hidden = false;
  busy(false);
  if (document.body.dataset.expanded === 'false') void action('expand').catch(fail);
  drawUpdates();
}
bind('updates-open', async () => { openUpdates(); await action('checkUpdates'); });
bind('update-install', async () => { await action('installUpdate'); });
bind('update-check', async () => { await action('checkUpdates'); });
function closeUpdates() {
  if (updatesState.busy) return;
  updatesDismissed = true; delete document.documentElement.dataset.update; element('update').hidden = true; element('updates-open').focus();
}
bind('update-close', async () => closeUpdates());
bind('sign-in', async () => { await action('signIn'); await discover(); });
bind('history', () => send({ type: 'history', surface: selected, all: true }));
const refreshScheduleQueue = bind('schedule-queue', async () => {
  element<HTMLDetailsElement>('conversation-actions').open = false;
  await send({ type: 'action', surface: selected, action: 'scheduleQueue' });
}, () => surfaces.find(surface => surface.id === selected)?.disabledActions?.includes('scheduleQueue') === true);
bind('history-new', async () => { element('history-panel').hidden = true; await send({ type: 'newConversation', surface: selected }); });
const closeHistory = () => { if (element('history-panel').hidden) return; element('history-panel').hidden = true; views.get(selected)?.frame.focus(); };
addEventListener('pointerdown', event => { const target = event.target as Node; if (!element('history-panel').contains(target) && !element('history').contains(target)) closeHistory(); });
addEventListener('blur', () => { if (document.activeElement?.tagName === 'IFRAME') { closeHistory(); element<HTMLDetailsElement>('tab-picker').open = false; element<HTMLDetailsElement>('conversation-actions').open = false; } });
addEventListener('keydown', event => {
  if (element('update').hidden) { if (event.key === 'Escape') closeHistory(); return; }
  if (event.key === 'Escape') { event.preventDefault(); closeUpdates(); }
  if (event.key !== 'Tab') return;
  const buttons = Array.from(element('update').querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
  const first = buttons[0], last = buttons.at(-1);
  if (!first) { event.preventDefault(); return; }
  if (!element('update').contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
const stream = new EventSource('events');
stream.onmessage = event => { try { receive(JSON.parse(event.data)); } catch (error) { fail(error); } };
stream.onerror = () => { recover(); };
localize(navigator.language); void onboarding().catch(() => undefined).finally(() => { onboarded = true; void discover().catch(fail); });
setInterval(() => { void discover().catch(() => undefined); }, 3000);
document.documentElement.dataset.ready = 'true';
addEventListener('beforeunload', () => { loadingIndicator.dispose(); stream.close(); });

addEventListener('keydown', event => { for (const id of ['tab-picker', 'conversation-actions']) if (event.key === 'Escape' && element<HTMLDetailsElement>(id).open) { element<HTMLDetailsElement>(id).open = false; element(id).querySelector<HTMLElement>('summary')?.focus(); } });
addEventListener('pointerdown', event => { for (const id of ['tab-picker', 'conversation-actions']) if (!element(id).contains(event.target as Node)) element<HTMLDetailsElement>(id).open = false; });
function placePicker(id: string) {
  const picker = element<HTMLDetailsElement>(id); const panel = picker.querySelector<HTMLElement>('.picker-panel'); if (!picker.open || !panel) return;
  const anchor = picker.querySelector('summary')!.getBoundingClientRect();
  panel.style.top = `${anchor.bottom + 4}px`; panel.style.visibility = 'visible';
  panel.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - panel.offsetWidth - 8))}px`;
}
for (const id of ['tab-picker', 'conversation-actions']) {
  element(id).querySelector('summary')!.addEventListener('click', () => requestAnimationFrame(() => placePicker(id)));
  element(id).addEventListener('toggle', () => placePicker(id));
  addEventListener('resize', () => placePicker(id));
}
Object.assign(window, { vibesSplash: () => { const node = element('loading'); if (node.dataset.off !== 'true') return; const logo = element<HTMLImageElement>('loading-logo'); logo.src = `logo-animated.svg?${Date.now()}`; node.dataset.off = 'false'; setTimeout(() => { if (views.get(selected)?.ready) node.dataset.off = 'true'; }, 1000); }, vibesCloseActiveTab: () => { if (selected) void closeTab(selected).catch(fail); } });
