import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { startShell } from '../src/host/server';
import { registerShellBridge } from '../src/main/bridge';
import { defaultPreferences } from '../src/main/preferences';

app.setPath('userData', process.argv[3]);
void app.whenReady().then(async () => {
  const inputs: Record<string, unknown>[] = [];
  const listeners = new Set<ServerResponse>();
  const surfaces = [{ id: 'first', label: 'Codex', kind: 'ai', tab: true, actions: ['scheduleQueue'], disabledActions: ['scheduleQueue'] }];
  const emit = (message: unknown) => { for (const listener of listeners) listener.write(`data: ${JSON.stringify(message)}\n\n`); };
  const hello = () => ({ type: 'hello', surfaces, platforms: [{ id: 'codex', label: 'Codex' }] });
  const token = 'a'.repeat(64);
  const host = createServer(async (request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`) { response.writeHead(403).end(); return; }
    if (request.url === '/status') { response.end(JSON.stringify({ protocol: 1, workspace: 'Fixture', locale: 'en', theme: {}, logo: '', allowed: true, background: true, signedIn: true })); return; }
    if (request.url === '/events') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' }); listeners.add(response); emit(hello());
      response.on('close', () => listeners.delete(response)); return;
    }
    let body = ''; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body); inputs.push(input);
    if (input.type === 'open') {
      const html = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'"><script nonce="fixture-nonce"></script></head><body class="arara-chat"><textarea id="input"></textarea><button id="send">Send</button><button id="update-assistant">Update Antigravity</button><script nonce="fixture-nonce">const api=acquireVsCodeApi();document.getElementById('send').onclick=()=>api.postMessage({type:'send',text:document.getElementById('input').value,requestId:'one-send'});document.getElementById('update-assistant').onclick=()=>api.postMessage({type:'cliSetupAction',action:'update'});</script></body></html>`;
      emit({ type: 'document', surface: input.surface, epoch: 1, html });
    }
    if (input.type === 'history') emit({ type: 'history', conversations: [] });
    if (input.type === 'createTab') { surfaces.push({ id: 'second', label: 'Codex', kind: 'ai', tab: true, actions: [], disabledActions: [] }); emit(hello()); emit({ type: 'openSurface', surface: 'second' }); }
    response.writeHead(204).end();
  });
  await new Promise<void>(resolve => host.listen(0, '127.0.0.1', resolve));
  const directory = join(process.argv[3], 'hosts'); await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'fixture.json'), JSON.stringify({ protocol: 1, pid: process.pid, port: (host.address() as { port: number }).port, token }), { mode: 0o600 });
  process.env.ARARA_VIBES_HOSTS = directory;
  const server = await startShell(process.argv[2], {
    locale: 'en', state: () => ({ pinned: true, expanded: true }), run: async () => {},
    preferences: async () => ({ ...defaultPreferences, onboarded: true }),
  });
  const window = new BrowserWindow({ show: false, webPreferences: { preload: join(process.argv[2], 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  registerShellBridge(window.webContents, server.url, server.dispatch);
  let blocked = 0;
  let blockActions = false;
  window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://127.0.0.1:*/*'] }, (details, callback) => {
    const cancel = blockActions && new URL(details.url).pathname.endsWith('/action'); if (cancel) blocked++;
    callback({ cancel });
  });
  const evaluate = (source: string) => window.webContents.executeJavaScript(source);
  const until = async (check: () => boolean | Promise<boolean>) => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 25)); }
    throw new Error('Native transport did not complete the requested chat action');
  };
  try {
    await window.loadURL(server.url);
    assert.equal(await evaluate("typeof window.araraVibes?.action"), 'function');
    await until(async () => window.webContents.mainFrame.frames.length > 0 && await window.webContents.mainFrame.frames[0].executeJavaScript("typeof document.getElementById('send')?.onclick === 'function'").catch(() => false));
    const frame = window.webContents.mainFrame.frames[0];
    assert.equal(await frame.executeJavaScript("typeof window.araraVibes"), 'undefined');
    await until(async () => !await evaluate("document.getElementById('conversation-actions').hidden"));
    assert.equal(await evaluate("document.getElementById('schedule-queue').disabled"), true);
    await evaluate("document.querySelector('#conversation-actions summary').click(); document.getElementById('schedule-queue').click()");
    assert.equal(inputs.some(input => input.type === 'action' && input.action === 'scheduleQueue'), false);
    surfaces[0].disabledActions = [];
    emit(hello());
    await until(async () => !await evaluate("document.getElementById('schedule-queue').disabled"));
    await evaluate("document.getElementById('schedule-queue').click()");
    await until(() => inputs.some(input => input.type === 'action' && input.action === 'scheduleQueue' && input.surface === 'first'));
    assert.equal(await evaluate("document.getElementById('conversation-actions').open"), false);
    blockActions = true;
    assert.equal(await evaluate("fetch('action',{method:'POST'}).then(()=>false,()=>true)"), true);
    assert.equal(blocked, 1);
    await frame.executeJavaScript("document.getElementById('input').value='Fixture draft';document.getElementById('send').click()");
    await until(() => inputs.some(input => input.type === 'input' && (input.message as { type: string }).type === 'send'));
    await frame.executeJavaScript("document.getElementById('update-assistant').click()");
    await until(() => inputs.some(input => input.type === 'input' && (input.message as { type: string; action?: string }).type === 'cliSetupAction' && (input.message as { action?: string }).action === 'update'));
    await evaluate("document.getElementById('history-new').click()");
    await until(() => inputs.some(input => input.type === 'newConversation'));
    await evaluate("document.querySelector('#conversation-actions summary').click()");
    await evaluate("document.querySelector('[data-platform=codex]').click()");
    await until(() => inputs.some(input => input.type === 'open' && input.surface === 'second'));
    assert.equal(await evaluate("document.getElementById('conversation-actions').hidden"), true);
    assert.equal(await evaluate("document.getElementById('conversation-actions').open"), false);
    assert.equal(inputs.filter(input => input.type === 'input' && (input.message as { type: string }).type === 'send').length, 1);
    assert.equal(inputs.filter(input => input.type === 'input' && (input.message as { type: string }).type === 'cliSetupAction').length, 1);
    assert.equal(inputs.filter(input => input.type === 'newConversation').length, 1);
    assert.equal(inputs.filter(input => input.type === 'createTab').length, 1);
    assert.equal(await evaluate("document.getElementById('feedback').hidden"), true);
    assert.equal(blocked, 1, 'Chat actions must not fall back to browser HTTP');
    process.stdout.write('PASS: native IPC sends once, routes assistant update, starts a conversation and creates a tab while browser action HTTP is blocked; chat iframe has no bridge\n');
  } finally {
    window.webContents.session.webRequest.onBeforeRequest(null); window.destroy(); server.close(); host.closeAllConnections(); host.close();
  }
  app.quit();
}).catch(error => { process.stderr.write(`${error.stack}\n`); app.exit(1); });
