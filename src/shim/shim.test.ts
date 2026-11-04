import { describe, expect, it, vi } from 'vitest';
import { EventEmitter, DisposableImpl } from './events';
import { Uri } from './uri';
import { Position, Range } from './position';

describe('events', () => {
  it('fires and stops after dispose', () => {
    const emitter = new EventEmitter<number>();
    const listener = vi.fn();
    const subscription = emitter.event(listener);
    emitter.fire(1);
    subscription.dispose();
    emitter.fire(2);
    expect(listener.mock.calls).toEqual([[1]]);
  });
  it('disposes once', () => {
    const callback = vi.fn();
    const disposable = new DisposableImpl(callback);
    disposable.dispose();
    disposable.dispose();
    expect(callback).toHaveBeenCalledOnce();
  });
});

describe('Uri', () => {
  it('round-trips file paths with spaces', () => {
    expect(Uri.file('/tmp/a b/c.ts').fsPath).toBe('/tmp/a b/c.ts');
  });
  it('joins paths and parses https', () => {
    expect(Uri.joinPath(Uri.file('/a'), 'b', '../c').path).toBe('/a/c');
    const uri = Uri.parse('https://x.test/p?q=1#f');
    expect([uri.scheme, uri.authority, uri.path, uri.query, uri.fragment]).toEqual(['https', 'x.test', '/p', 'q=1', 'f']);
  });
});

describe('Range', () => {
  it('accepts numbers or positions', () => {
    const a = new Range(1, 2, 3, 4);
    const b = new Range(new Position(1, 2), new Position(3, 4));
    expect(a).toEqual(b);
    expect(new Range(0, 0, 0, 0).isEmpty).toBe(true);
  });
});

import { Commands } from './commands';
import { Configuration } from './configuration';
import { Memento } from './memento';
import { jsonStore } from './jsonStore';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('commands', () => {
  it('runs registered handlers, falls back, ignores unknown', async () => {
    const commands = new Commands();
    const registration = commands.registerCommand('a', (x) => `a${x}`);
    commands.setFallback('b', () => 'fb');
    expect(await commands.executeCommand('a', 1)).toBe('a1');
    expect(await commands.executeCommand('b')).toBe('fb');
    registration.dispose();
    expect(await commands.executeCommand('a')).toBeUndefined();
  });
});

describe('configuration and memento', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibes-'));
  it('persists updates, notifies and honours defaults', async () => {
    const store = jsonStore(join(dir, 'c.json'));
    const config = new Configuration(store, { 'arara.x': 1 });
    const seen = vi.fn();
    config.onDidChangeConfiguration(event => seen(event.affectsConfiguration('arara')));
    expect(config.getConfiguration('arara').get('x')).toBe(1);
    await config.getConfiguration('arara').update('x', 2);
    expect(new Configuration(store, {}).getConfiguration('arara').get('x')).toBe(2);
    expect(seen).toHaveBeenCalledWith(true);
    await config.getConfiguration('arara').update('x', undefined);
    expect(config.getConfiguration('arara').get('x')).toBe(1);
  });
  it('mementos round trip and tolerate corrupt files', async () => {
    const memento = new Memento(jsonStore(join(dir, 'm.json')));
    await memento.update('k', { a: 1 });
    expect(memento.get('k')).toEqual({ a: 1 });
    expect(memento.get('none', 5)).toBe(5);
    expect(jsonStore(join(dir, 'missing.json')).read()).toEqual({});
  });
});
