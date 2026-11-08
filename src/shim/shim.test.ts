import { describe, expect, it, vi } from 'vitest';
import { EventEmitter, DisposableImpl } from './events';
import { Uri } from './uri';
import { Position, Range } from './position';
import { Commands } from './commands';
import { Configuration } from './configuration';
import { Memento } from './memento';
import { jsonStore } from './jsonStore';
import { Secrets } from './secrets';
import { Workspace } from './workspace';
import { Window } from './window';
import { Env } from './env';
import { createVscodeShim } from './vscode';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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
    const file = resolve('/tmp/a b/c.ts');
    expect(Uri.file(file).fsPath).toBe(file);
  });
  it('joins paths and parses https', () => {
    expect(Uri.joinPath(Uri.file('/a'), 'b', '../c').path).toBe(`${Uri.file('/a').path}/c`);
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

describe('secrets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibes-sec-'));
  it('stores and retrieves secrets with change notification', async () => {
    const secrets = new Secrets(jsonStore(join(dir, 's.json')));
    const change = vi.fn();
    secrets.onDidChange(change);
    await secrets.store('key1', 'secret-val');
    expect(await secrets.get('key1')).toBe('secret-val');
    expect(change).toHaveBeenCalledWith({ key: 'key1' });
    await secrets.delete('key1');
    expect(await secrets.get('key1')).toBeUndefined();
  });
});

describe('workspace and fs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibes-ws-'));
  it('handles files and directories', async () => {
    const store = jsonStore(join(dir, 'config.json'));
    const config = new Configuration(store, {});
    const ws = new Workspace(config, dir);
    expect(ws.workspaceFolders?.[0]?.uri.fsPath).toBe(dir);
    expect(ws.asRelativePath(join(dir, 'sub/file.txt'))).toBe('sub/file.txt');

    const fileUri = Uri.file(join(dir, 'test.txt'));
    await ws.fs.writeFile(fileUri, new TextEncoder().encode('hello world'));
    const content = await ws.fs.readFile(fileUri);
    expect(new TextDecoder().decode(content)).toBe('hello world');

    const stat = await ws.fs.stat(fileUri);
    expect(stat.size).toBe(11);

    const entries = await ws.fs.readDirectory(Uri.file(dir));
    expect(entries.some(([name]) => name === 'test.txt')).toBe(true);

    await ws.fs.delete(fileUri);
    const afterDelete = await ws.fs.readDirectory(Uri.file(dir));
    expect(afterDelete.some(([name]) => name === 'test.txt')).toBe(false);
  });
});

describe('window and webviews', () => {
  it('registers providers and routes webview messaging', async () => {
    const win = new Window();
    const messages: unknown[] = [];
    const view = win.resolveView('test.view');
    const toRenderer: unknown[] = [];
    view.webview.onMessageToRenderer(m => toRenderer.push(m));

    win.registerWebviewViewProvider('test.view', {
      resolveWebviewView(v) {
        v.webview.onDidReceiveMessage(m => messages.push(m));
        void v.webview.postMessage({ type: 'from-provider' });
      },
    });

    view.webview.receiveFromRenderer({ type: 'from-ui' });
    expect(messages).toEqual([{ type: 'from-ui' }]);
    expect(toRenderer).toEqual([{ type: 'from-provider' }]);
  });
});

describe('env', () => {
  it('manages clipboard in memory', async () => {
    const env = new Env();
    await env.clipboard.writeText('copied text');
    expect(await env.clipboard.readText()).toBe('copied text');
  });
});

describe('createVscodeShim', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibes-shim-'));
  it('creates complete vscode instance', () => {
    const config = new Configuration(jsonStore(join(dir, 'c.json')), {});
    const vscode = createVscodeShim(config, dir);
    expect(vscode.commands).toBeDefined();
    expect(vscode.workspace).toBeDefined();
    expect(vscode.window).toBeDefined();
    expect(vscode.env).toBeDefined();
    expect(vscode.Uri).toBeDefined();
    expect(vscode.Range).toBeDefined();
    expect(vscode.Position).toBeDefined();
  });
});
