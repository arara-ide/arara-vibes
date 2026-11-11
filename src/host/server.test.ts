import { afterEach, expect, it } from 'vitest';
import { startShell } from './server';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const cleanups: (() => unknown)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
it('confines the browser shell, rejects cross-origin actions and serves chat documents with their own policy', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vibes-shell-'));
  cleanups.push(() => rm(directory, { recursive: true }));
  await writeFile(join(directory, 'index.html'), '<html>Shell</html>');
  const shell = await startShell(directory, { locale: 'en', state: () => ({ pinned: true, expanded: true, glass: true }), run: async () => {} });
  cleanups.push(() => shell.close());
  const page = await fetch(shell.url);
  const events = await fetch(new URL('events', shell.url));
  const reader = events.body!.getReader();
  const first = await reader.read();
  expect(new TextDecoder().decode(first.value)).toContain('"glass":true');
  await reader.cancel();
  expect(page.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  expect((await fetch(new URL('/', shell.url))).status).toBe(403);
  const post = (input: unknown, extra = {}) => fetch(new URL('action', shell.url), { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(input) });
  expect((await post({ action: 'hide' }, { Origin: 'https://attacker.test' })).status).toBe(403);
  expect((await post({ action: 'unknown' })).status).toBe(400);
  expect((await post({ action: 'pin' })).status).toBe(400);
  const path = await (await post({ action: 'document', html: '<html>Original chat</html>' })).json();
  const chat = await fetch(new URL(path, shell.url));
  expect(await chat.text()).toContain('Original chat');
  expect(chat.headers.get('Content-Security-Policy')).toBe("frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
  expect(chat.headers.get('Cache-Control')).toBe('no-store');
});
it('routes preferences, update and sign-in link actions through the shell', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vibes-shell-'));
  cleanups.push(() => rm(directory, { recursive: true }));
  await writeFile(join(directory, 'index.html'), '<html>Shell</html>');
  await writeFile(join(directory, 'logo-animated.svg'), '<svg/>');
  const calls: unknown[] = [];
  const shell = await startShell(directory, { locale: 'en', state: () => ({ pinned: true, expanded: true, update: 'v9.9.9' }), run: async () => {},
    preferences: async update => { calls.push(['preferences', update]); return { animations: false }; }, installUpdate: async () => { calls.push(['install']); return true; }, shortcutRecording: recording => { calls.push(['recording', recording]); } });
  cleanups.push(() => shell.close());
  const events = await fetch(new URL('events', shell.url));
  const reader = events.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('"update":"v9.9.9"');
  await reader.cancel();
  const post = (input: unknown) => fetch(new URL('action', shell.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  expect(await (await post({ action: 'preferences', preferences: { animations: false } })).json()).toEqual({ animations: false });
  expect(await (await post({ action: 'installUpdate' })).json()).toBe(true);
  expect((await post({ action: 'copySignInLink' })).status).toBe(500);
  expect((await post({ action: 'shortcutRecording', recording: true })).status).toBe(200);
  expect((await post({ action: 'shortcutRecording', recording: 'yes' })).status).toBe(200);
  expect(calls).toEqual([['preferences', { animations: false }], ['install'], ['recording', true], ['recording', false]]);
  const logo = await fetch(new URL('logo-animated.svg?123', shell.url));
  expect(logo.status).toBe(200);
  expect(logo.headers.get('Content-Type')).toBe('image/svg+xml');
  expect(await logo.text()).toBe('<svg/>');
});

it('routes update checks and product selection while rejecting unknown products', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vibes-updates-shell-'));
  cleanups.push(() => rm(directory, { recursive: true }));
  const calls: unknown[] = [];
  const shell = await startShell(directory, {
    locale: 'en', state: () => ({ pinned: true, expanded: true, updates: { busy: false, products: [{ product: 'arara-code', current: '1.135.07400', latest: '1.135.07430', status: 'available' }] } }),
    run: async () => {}, checkUpdates: async () => { calls.push('check'); }, installUpdate: async product => { calls.push(product ?? 'all'); },
  });
  cleanups.push(() => shell.close());
  const post = (input: unknown) => fetch(new URL('action', shell.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  expect((await post({ action: 'checkUpdates' })).status).toBe(200);
  expect((await post({ action: 'installUpdate', product: 'arara-code' })).status).toBe(200);
  expect((await post({ action: 'installUpdate', product: 'arara-vibes' })).status).toBe(200);
  expect((await post({ action: 'installUpdate' })).status).toBe(200);
  expect((await post({ action: 'installUpdate', product: '../../other' })).status).toBe(400);
  expect((await post({ action: 'installUpdate', product: {} })).status).toBe(400);
  expect(calls).toEqual(['check', 'arara-code', 'arara-vibes', 'all']);
  const events = await fetch(new URL('events', shell.url)); const reader = events.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('"current":"1.135.07400"');
  await reader.cancel();
});

it('shares action validation and limits between native IPC and HTTP', async () => {
  const calls: string[] = [];
  const shell = await startShell('/unused', { locale: 'en', state: () => ({ pinned: true, expanded: true }), run: async action => { calls.push(action); } });
  cleanups.push(() => shell.close());
  const post = (input: unknown) => fetch(new URL('action', shell.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  for (const input of [null, [], {}, { action: 'unknown' }, { action: 'installUpdate', product: 'other' }]) {
    expect((await shell.dispatch(input)).status).toBe(400);
    expect((await post(input)).status).toBe(400);
  }
  expect(await shell.dispatch({ action: 'hide', extra: 'x'.repeat(24 * 1024 * 1024) })).toEqual({ status: 413, result: null });
  expect(await shell.dispatch({ action: 'hide' })).toEqual({ status: 200, result: null });
  expect((await post({ action: 'hide' })).status).toBe(200);
  expect(calls).toEqual(['hide', 'hide']);
});
