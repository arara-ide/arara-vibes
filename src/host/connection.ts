import { readdir, readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

export interface HostDescriptor { protocol: 1; pid: number; port: number; token: string }
export interface HostInfo { id: string; workspace: string; locale: string; allowed: boolean; theme: Record<string, string>; logo: string; background?: boolean; signedIn?: boolean }
export const hostDirectory = () => process.env.ARARA_VIBES_HOSTS ?? join(homedir(), '.arara', 'vibes', 'hosts');
export function validDescriptor(value: unknown): value is HostDescriptor {
  const item = value as HostDescriptor | null;
  return !!item && item.protocol === 1 && Number.isSafeInteger(item.pid) && item.pid > 0
    && Number.isInteger(item.port) && item.port > 0 && item.port < 65536 && typeof item.token === 'string' && /^[a-f0-9]{64}$/.test(item.token);
}

export class HostConnection {
  private hosts = new Map<string, HostDescriptor>();
  private controller?: AbortController;
  private client = randomUUID();
  private selected?: HostDescriptor;
  constructor(private readonly emit: (event: Record<string, unknown>) => void, private readonly directory = hostDirectory()) {}
  async discover(): Promise<HostInfo[]> {
    this.hosts.clear();
    const files = await readdir(this.directory).catch(() => []);
    const results = await Promise.all(files.filter(file => file.endsWith('.json')).map(async file => {
      try {
        const path = join(this.directory, file);
        const stat = await lstat(path);
        if (!stat.isFile() || stat.size > 4096 || (process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()))) return;
        const descriptor: unknown = JSON.parse(await readFile(path, 'utf8'));
        if (!validDescriptor(descriptor)) return;
        const response = await fetch(`http://127.0.0.1:${descriptor.port}/status`, { headers: { Authorization: `Bearer ${descriptor.token}` }, signal: AbortSignal.timeout(1200), redirect: 'error' });
        if (!response.ok) return;
        const info = await response.json() as Omit<HostInfo, 'id'> & { protocol: number };
        if (info.protocol !== 1 || typeof info.workspace !== 'string') return;
        this.hosts.set(file, descriptor);
        return { ...info, id: file };
      } catch { return; }
    }));
    return results.filter((item): item is HostInfo & { protocol: number } => !!item);
  }
  async connect(id: string) {
    const host = this.hosts.get(id);
    if (!host) throw new Error('Unknown IDE host');
    this.disconnect();
    const controller = new AbortController();
    this.controller = controller;
    this.selected = host;
    this.client = randomUUID();
    const response = await fetch(`http://127.0.0.1:${host.port}/events`, { headers: this.headers(), signal: controller.signal, redirect: 'error' });
    if (!response.ok || !response.body) { this.disconnect(); throw new Error('IDE connection unavailable'); }
    void this.read(response.body, controller);
  }
  private async read(stream: ReadableStream<Uint8Array>, controller: AbortController) {
    try {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!controller.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 24 * 1024 * 1024) throw new Error('IDE event too large');
        let end: number;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const event = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          if (event.startsWith('data: ') && !controller.signal.aborted) this.emit(JSON.parse(event.slice(6)));
        }
      }
    } catch { }
    finally { if (!controller.signal.aborted) { this.disconnect(); this.emit({ type: 'disconnected' }); } }
  }
  async signIn() {
    if (!this.selected) throw new Error('IDE disconnected');
    const response = await fetch(`http://127.0.0.1:${this.selected.port}/signin`, { method: 'POST', headers: this.headers(), signal: AbortSignal.timeout(5 * 60_000), redirect: 'error' });
    if (!response.ok) throw new Error('Sign in failed');
  }
  async copySignInLink() {
    if (!this.selected) throw new Error('IDE disconnected');
    const response = await fetch(`http://127.0.0.1:${this.selected.port}/signin-link`, { method: 'POST', headers: this.headers(), signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) throw new Error('Copy failed');
  }
  private headers() { return { Authorization: `Bearer ${this.selected?.token}`, 'x-vibes-client': this.client }; }
  async send(message: Record<string, unknown>) {
    if (!this.selected) throw new Error('IDE disconnected');
    const response = await fetch(`http://127.0.0.1:${this.selected.port}/message`, { method: 'POST', headers: { ...this.headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(message), signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) throw new Error('IDE message rejected');
  }
  async shutdown() {
    if (!this.selected) return;
    await fetch(`http://127.0.0.1:${this.selected.port}/close`, { method: 'POST', headers: this.headers(), signal: AbortSignal.timeout(2000), redirect: 'error' }).catch(() => undefined);
  }
  disconnect() { this.controller?.abort(); this.controller = undefined; this.selected = undefined; }
}
