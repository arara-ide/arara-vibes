export interface MementoStore { read(): Record<string, unknown>; write(values: Record<string, unknown>): void }

export class Memento {
  constructor(private readonly store: MementoStore) {}
  keys() {
    return Object.keys(this.store.read());
  }
  get<T>(key: string, fallback?: T): T | undefined {
    const values = this.store.read();
    return (key in values ? values[key] : fallback) as T | undefined;
  }
  async update(key: string, value: unknown) {
    const next = { ...this.store.read() };
    if (value === undefined) delete next[key];
    else next[key] = value;
    this.store.write(next);
  }
  setKeysForSync() {}
}
