import { createServer, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { HostConnection } from './connection';

export interface ShellActions { run(action: string): Promise<unknown>; state(): { pinned: boolean; expanded: boolean; glass?: boolean; update?: string }; locale: string; preferences?(update?: unknown): Promise<unknown>; installUpdate?(): Promise<unknown> }
export async function startShell(directory: string, actions: ShellActions) {
  const secret = randomBytes(24).toString('hex');
  const prefix = `/${secret}/`;
  const listeners = new Set<ServerResponse>();
  const documents = new Map<string, { path: string; html: string }>();
  const emit = (message: Record<string, unknown>) => {
    for (const listener of listeners) {
      if (listener.writableLength > 24 * 1024 * 1024) listener.destroy();
      else listener.write(`data: ${JSON.stringify(message)}\n\n`);
    }
  };
  const connection = new HostConnection(emit);
  let origin = '';
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (request.headers.host !== new URL(origin).host || (request.headers.origin && request.headers.origin !== origin) || !request.url?.startsWith(prefix)) { response.writeHead(403).end(); return; }
    const route = request.url.slice(prefix.length).split('?')[0];
    try {
      if (request.method === 'GET' && route === 'events') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.write(`data: ${JSON.stringify({ type: 'shell', locale: actions.locale, ...actions.state() })}\n\n`);
        listeners.add(response);
        const timer = setInterval(() => response.write(': heartbeat\n\n'), 10000);
        response.on('close', () => { clearInterval(timer); listeners.delete(response); }); return;
      }
      if (request.method === 'POST' && route === 'action') {
        if (request.headers['content-type'] !== 'application/json') { response.writeHead(415).end(); return; }
        let body = '';
        for await (const chunk of request) { body += chunk.toString(); if (Buffer.byteLength(body) > 24 * 1024 * 1024) { response.writeHead(413).end(); return; } }
        const input = JSON.parse(body) as { action: string; key?: string; id?: string; message?: Record<string, unknown>; html?: string };
        let result: unknown;
        if (input.action === 'document' && typeof input.html === 'string') { const key = typeof input.key === 'string' ? input.key : 'default'; if (!documents.has(key) && documents.size >= 128) { response.writeHead(429).end(); return; } const document = { path: `document-${randomBytes(16).toString('hex')}`, html: input.html }; documents.set(key, document); result = document.path; }
        else if (input.action === 'discover') result = await connection.discover();
        else if (input.action === 'connect' && typeof input.id === 'string') result = await connection.connect(input.id);
        else if (input.action === 'message' && input.message && typeof input.message === 'object') result = await connection.send(input.message);
        else if (input.action === 'preferences' && actions.preferences) { result = await actions.preferences((input as { preferences?: unknown }).preferences); emit({ type: 'preferences', preferences: result }); }
        else if (input.action === 'copySignInLink') await connection.copySignInLink();
        else if (input.action === 'installUpdate' && actions.installUpdate) result = await actions.installUpdate();
        else if (input.action === 'signIn') result = await connection.signIn();
        else if (input.action === 'disconnect') connection.disconnect();
        else if (['pin', 'expand', 'hide', 'startHost'].includes(input.action)) { result = await actions.run(input.action); emit({ type: 'shell', ...actions.state() }); }
        else { response.writeHead(400).end(); return; }
        response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(result ?? null)); return;
      }
      const document = [...documents.values()].find(item => item.path === route);
      if (request.method === 'GET' && document) { response.setHeader('Content-Type', 'text/html'); response.setHeader('Content-Security-Policy', "frame-ancestors 'self'; base-uri 'none'; form-action 'none'"); response.end(document.html); return; }
      const assets: Record<string, [string, string]> = { '': ['index.html', 'text/html'], 'renderer.js': ['renderer.js', 'text/javascript'], 'shell.css': ['shell.css', 'text/css'], 'tokens.css': ['tokens.css', 'text/css'], 'logo.svg': ['logo.svg', 'image/svg+xml'], 'logo-white.svg': ['logo-white.svg', 'image/svg+xml'], 'logo-animated.svg': ['logo-animated.svg', 'image/svg+xml'], 'icons.svg': ['icons.svg', 'image/svg+xml'] };
      const asset = assets[route];
      if (request.method !== 'GET' || !asset) { response.writeHead(404).end(); return; }
      response.setHeader('Content-Type', asset[1]);
      response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self' about:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
      response.end(await readFile(join(directory, asset[0])));
    } catch { response.writeHead(500).end(JSON.stringify({ error: 'Action failed' })); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing shell address');
  origin = `http://127.0.0.1:${address.port}`;
  return { url: `${origin}${prefix}`, emit, shutdown: () => connection.shutdown(), close() { connection.disconnect(); for (const response of listeners) response.end(); server.close(); server.closeAllConnections(); } };
}
