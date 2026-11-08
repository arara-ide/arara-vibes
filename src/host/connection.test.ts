import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HostConnection, validDescriptor } from './connection';

const cleanups: (() => unknown)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
describe('IDE discovery and transport', () => {
  it.each([null, {}, { protocol: 2 }, { protocol: 1, pid: 1, port: 0, token: 'a'.repeat(64) }, { protocol: 1, pid: 1, port: 80, token: '../secret' }])('rejects invalid descriptor %j', input => { expect(validDescriptor(input)).toBe(false); });
  it('discovers a private local host and transfers ordered events without leaking its capability', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vibes-transport-'));
    cleanups.push(() => rm(directory, { recursive: true }));
    const token = 'a'.repeat(64);
    const inputs: unknown[] = [];
    const server = createServer(async (request, response) => {
      expect(request.headers.authorization).toBe(`Bearer ${token}`);
      if (request.url === '/status') response.end(JSON.stringify({ protocol: 1, workspace: 'Test', allowed: true, locale: 'en', theme: {}, logo: '' }));
      else if (request.url === '/events') { response.writeHead(200, { 'Content-Type': 'text/event-stream' }); response.write('data: {"type":"hel'); response.write('lo"}\n\ndata: {"type":"event"}\n\n'); }
      else { let body = ''; for await (const chunk of request) body += chunk; inputs.push(JSON.parse(body)); response.writeHead(204).end(); }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(() => { server.closeAllConnections(); server.close(); });
    const address = server.address() as { port: number };
    await writeFile(join(directory, 'host.json'), JSON.stringify({ protocol: 1, pid: process.pid, port: address.port, token }), { mode: 0o600 });
    const events: unknown[] = [];
    const connection = new HostConnection(message => events.push(message), directory);
    cleanups.push(() => connection.disconnect());
    const hosts = await connection.discover();
    expect(hosts).toHaveLength(1);
    expect(JSON.stringify(hosts)).not.toContain(token);
    await connection.connect(hosts[0].id);
    await expect.poll(() => events).toEqual([{ type: 'hello' }, { type: 'event' }]);
    await connection.send({ type: 'open', surface: 'test' });
    expect(inputs).toEqual([{ type: 'open', surface: 'test' }]);
    connection.disconnect();
    await expect(connection.send({})).rejects.toThrow('disconnected');
  });
});
