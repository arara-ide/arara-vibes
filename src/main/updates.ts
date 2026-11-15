import { newerVersion, isCurrentVersion, validVersion } from './update';

export const UPDATE_PRODUCTS = ['arara-code', 'arara-vibes'] as const;
export type UpdateProduct = typeof UPDATE_PRODUCTS[number];
export type UpdateStatus = 'checking' | 'current' | 'available' | 'store' | 'downloading' | 'ready' | 'installing' | 'restarting' | 'error' | 'development';
export type UpdateFailureReason = 'migration' | 'gatekeeper' | 'open';
export class UpdateFailure extends Error { constructor(readonly reason: UpdateFailureReason) { super(reason); } }
export interface ProductUpdate { product: UpdateProduct; current?: string; latest?: string; store?: boolean; status: UpdateStatus; error?: 'check' | 'install' | UpdateFailureReason; command?: string }
export interface PlannedUpdate { product: UpdateProduct; version: string }
export interface UpdatesState { products: ProductUpdate[]; busy: boolean }
interface UpdateDependencies {
  current(product: UpdateProduct): Promise<{ version?: string; development?: boolean; store?: boolean }>;
  openStore?(product: UpdateProduct): Promise<void>;
  latest(product: UpdateProduct): Promise<string>;
  download(product: UpdateProduct, version: string): Promise<string>;
  install(product: UpdateProduct, file: string, version: string): Promise<string | void>;
  confirm?(plan: PlannedUpdate[]): Promise<boolean>;
  changed(state: UpdatesState): void;
}

export class Updates {
  private products: ProductUpdate[] = UPDATE_PRODUCTS.map(product => ({ product, status: 'checking' }));
  private operation?: Promise<void>;
  private busy = false;
  constructor(private readonly deps: UpdateDependencies) {}
  state(): UpdatesState { return { products: this.products.map(item => ({ ...item })), busy: this.busy }; }
  private item(product: UpdateProduct) { return this.products.find(entry => entry.product === product)!; }
  private publish() { this.deps.changed(this.state()); }
  private set(product: UpdateProduct, patch: Partial<ProductUpdate>) {
    this.products = this.products.map(item => item.product === product ? { ...item, ...patch } : item);
    this.publish();
  }
  private async inspect(product: UpdateProduct) {
    this.set(product, { status: 'checking', error: undefined, command: undefined });
    try {
      const current = await this.deps.current(product);
      this.set(product, { store: current.store });
      if (current.development) { this.set(product, { current: current.version, latest: undefined, status: 'development', command: undefined }); return; }
      const latest = await this.deps.latest(product);
      if (!validVersion(latest) || (current.version && !validVersion(current.version))) throw new Error('Invalid update version');
      this.set(product, { current: current.version, latest, status: !current.version || newerVersion(latest, current.version) ? 'available' : 'current', command: undefined });
    } catch { this.set(product, { status: 'error', error: 'check', command: undefined }); }
  }
  private run(work: () => Promise<void>) {
    if (this.operation) return this.operation;
    this.busy = true; this.publish();
    this.operation = work().finally(() => { this.operation = undefined; this.busy = false; this.products = this.products.map(item => (item.status === 'downloading' || (item.status === 'ready' && !item.command)) ? { ...item, status: 'available' } : item); this.publish(); });
    return this.operation;
  }
  check() { return this.run(async () => { await Promise.all(UPDATE_PRODUCTS.map(product => this.inspect(product))); }); }
  update(product?: UpdateProduct) {
    return this.run(async () => {
      await Promise.all(UPDATE_PRODUCTS.map(item => this.inspect(item)));
      const selected = product === 'arara-code' ? ['arara-code'] as const : UPDATE_PRODUCTS;
      const files = new Map<UpdateProduct, string>();
      const items = selected.map(name => this.item(name));
      const plan = items.flatMap(item => !item.store && item.status === 'available' && item.latest ? [{ product: item.product, version: item.latest }] : []);
      if (plan.length && this.deps.confirm && !items.some(item => !item.store && item.status === 'error') && !await this.deps.confirm(plan)) return;
      for (const name of selected) {
        const item = this.item(name);
        if (item.store && (item.status === 'available' || item.status === 'error')) {
          try {
            if (!this.deps.openStore) throw new Error('Microsoft Store unavailable');
            await this.deps.openStore(name);
            this.set(name, { status: 'store', error: undefined });
          } catch { this.set(name, { status: 'error', error: 'install' }); return; }
          continue;
        }
        if (item.status === 'error') return;
        if (item.status !== 'available' || !item.latest) continue;
        this.set(name, { status: 'downloading', command: undefined });
        try { files.set(name, await this.deps.download(name, item.latest)); this.set(name, { status: 'ready' }); }
        catch { this.set(name, { status: 'error', error: 'install' }); return; }
      }
      for (const [name, file] of files) {
        const item = this.item(name);
        this.set(name, { status: 'installing' });
        try {
          const command = await this.deps.install(name, file, item.latest!);
          if (typeof command === 'string') { this.set(name, { status: 'ready', command, error: undefined }); continue; }
          if (name === 'arara-vibes') { this.set(name, { status: 'restarting' }); continue; }
          const current = await this.deps.current(name);
          if (!isCurrentVersion(item.latest!, current.version)) throw new Error('Installed version did not change');
          this.set(name, { current: current.version, status: 'current', error: undefined, command: undefined });
        } catch (error) { this.set(name, { status: 'error', error: error instanceof UpdateFailure ? error.reason : 'install' }); return; }
      }
    });
  }
}
