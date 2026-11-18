import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HostConnection } from './host/connection';
import { startShell } from './host/server';
import { compactWindowBounds, fitWindowBounds } from './main/windowPlacement';
import { defaultPreferences, loadPreferences, savePreferences } from './main/preferences';
import { loadWindowPlacement, saveWindowPlacement } from './main/windowPlacementStore';
import { jsonStore } from './shim/jsonStore';
import { readJsonRecordSync, writeJsonAtomicSync } from './atomicJson';
import { chatDocument } from './renderer/document';

const temps: string[] = [];
const cleanups: (() => void | Promise<void>)[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const fn of cleanups.splice(0)) await fn();
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix = 'vibes-chaos-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

describe('arara-vibes chaos and concurrency', () => {
  it('prevents an older failing HostConnection.connect from aborting a newer connection and survives broken SSE JSON', async () => {
    const dir = tempDir();
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
    const events: Record<string, unknown>[] = [];
    const srv = createServer(async (req, res) => {
      if (req.url === '/status') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ protocol: 1, workspace: '/w', locale: 'en', allowed: true, theme: {}, logo: '' }));
        return;
      }
      if (req.url === '/events') {
        if (req.headers.authorization === 'Bearer ' + 'a'.repeat(64)) {
          await firstGate;
          if (!res.destroyed) res.writeHead(503).end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: {broken json\n\n');
        res.write(`data: ${JSON.stringify({ type: 'hello', ok: true })}\n\n`);
      }
    });
    await new Promise<void>(resolve => srv.listen(0, '127.0.0.1', resolve));
    cleanups.push(() => new Promise<void>(resolve => { srv.closeAllConnections(); srv.close(() => resolve()); }));
    const { port } = srv.address() as { port: number };
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ protocol: 1, pid: 1001, port, token: 'a'.repeat(64) }), { mode: 0o600 });
    writeFileSync(join(dir, 'b.json'), JSON.stringify({ protocol: 1, pid: 1002, port, token: 'b'.repeat(64) }), { mode: 0o600 });

    const conn = new HostConnection(event => events.push(event), dir);
    cleanups.push(() => conn.disconnect());
    await conn.discover();

    const first = conn.connect('a.json').catch(error => error as Error);
    await new Promise(resolve => setTimeout(resolve, 20));
    await conn.connect('b.json');
    releaseFirst();
    await first;
    await new Promise(resolve => setTimeout(resolve, 40));

    expect(events.some(event => event.type === 'hello' && event.ok === true)).toBe(true);
    expect(events.some(event => event.type === 'disconnected')).toBe(false);
  });

  it('decodes split multi-byte UTF-8 POST bodies in startShell, returns 400 on malformed JSON and 403 on bad origin', async () => {
    const dir = tempDir();
    let copied = '';
    const shell = await startShell(dir, {
      locale: 'en',
      state: () => ({ pinned: false, expanded: false }),
      run: async () => null,
      copyText: text => { copied = text; },
    });
    cleanups.push(() => shell.close());

    const url = new URL(shell.url);
    const payload = Buffer.from(JSON.stringify({ action: 'copyText', text: 'Olá 🦜 configuração 🚀' }), 'utf8');
    const okStatus = await new Promise<number>((resolve, reject) => {
      const req = httpRequest({
        hostname: url.hostname,
        port: Number(url.port),
        path: `${url.pathname}action`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': String(payload.length), Origin: url.origin },
      }, res => { res.resume(); resolve(res.statusCode ?? 0); });
      req.on('error', reject);
      for (let i = 0; i < payload.length; i++) req.write(payload.subarray(i, i + 1));
      req.end();
    });
    expect(okStatus).toBe(200);
    expect(copied).toBe('Olá 🦜 configuração 🚀');

    const badJson = await fetch(`${shell.url}action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"action":',
    });
    expect(badJson.status).toBe(400);

    const badOrigin = await fetch(`${shell.url}action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ action: 'copyText', text: 'x' }),
    });
    expect(badOrigin.status).toBe(403);
  });

  it('clamps extreme 0x0, negative and NaN display areas safely while preserving compactHeight', () => {
    expect(fitWindowBounds({ x: -9999, y: -9999, width: 420, height: 520 }, { x: 0, y: 0, width: 0, height: 0 })).toEqual({
      x: 0, y: 0, width: 1, height: 1,
    });
    expect(fitWindowBounds({ x: 50, y: 50, width: -10, height: Number.NaN }, { x: 10, y: 20, width: 320, height: 240 })).toEqual({
      x: 50, y: 20, width: 1, height: 240,
    });
    expect(compactWindowBounds({ x: 0, y: 0, width: 400, height: 500 }, {}, { x: 0, y: 25, width: 1440, height: 875 }).height).toBe(44);
  });

  it('refuses symlink targets, strips prototype pollution keys, and handles concurrent atomic writes', async () => {
    const dir = tempDir();
    if (process.platform !== 'win32') {
      const outside = join(dir, 'outside.json');
      writeFileSync(outside, '{"secret":true}');
      const prefLink = join(dir, 'prefs.json');
      const placeLink = join(dir, 'placement.json');
      const storeLink = join(dir, 'store.json');
      symlinkSync(outside, prefLink);
      symlinkSync(outside, placeLink);
      symlinkSync(outside, storeLink);
      expect(() => savePreferences(prefLink, defaultPreferences)).toThrow(/symbolic link/);
      expect(() => saveWindowPlacement(placeLink, {})).toThrow(/symbolic link/);
      expect(() => jsonStore(storeLink).write({ a: 1 })).toThrow(/symbolic link/);
      expect(readJsonRecordSync(prefLink)).toEqual({});
      expect(readFileSync(outside, 'utf8')).toBe('{"secret":true}');
    }

    const polluted = join(dir, 'polluted.json');
    writeFileSync(polluted, '{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"x":1}},"ok":42}');
    const cleaned = jsonStore(polluted).read();
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
    expect(Object.hasOwn(cleaned, '__proto__')).toBe(false);
    expect(Object.hasOwn(cleaned, 'constructor')).toBe(false);
    expect(cleaned.ok).toBe(42);
    expect(loadPreferences(join(dir, 'missing-or-corrupt.json'))).toEqual(defaultPreferences);

    const corrupt = join(dir, 'corrupt.json');
    writeFileSync(corrupt, '{not json');
    expect(loadWindowPlacement(corrupt)).toEqual({});

    const target = join(dir, 'concurrent.json');
    await Promise.all(Array.from({ length: 12 }, (_, i) => Promise.resolve().then(() => writeJsonAtomicSync(target, { step: i }))));
    expect(typeof readJsonRecordSync(target).step).toBe('number');
  });

  it('rejects malicious CSP nonces in chatDocument before interpolation', () => {
    const prevDomParser = (globalThis as { DOMParser?: unknown }).DOMParser;
    (globalThis as { DOMParser?: unknown }).DOMParser = class {
      parseFromString() {
        const script = { getAttribute: () => 'bad"><script>alert(1)</script>' };
        const policy = { setAttribute: () => {} };
        return {
          querySelector: (selector: string) => selector === 'script[nonce]' ? script : policy,
        };
      }
    };
    try {
      expect(() => chatDocument('<html></html>', 'tok', {}, null)).toThrow('Invalid chat document');
    } finally {
      (globalThis as { DOMParser?: unknown }).DOMParser = prevDomParser;
    }
  });
});
