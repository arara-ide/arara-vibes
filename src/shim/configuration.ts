import { EventEmitter } from './events';

export type Defaults = Record<string, unknown>;
export interface ConfigStore { read(): Record<string, unknown>; write(values: Record<string, unknown>): void }

export class Configuration {
  private readonly changes = new EventEmitter<{ affectsConfiguration(section: string): boolean }>();
  readonly onDidChangeConfiguration = this.changes.event;
  constructor(private readonly store: ConfigStore, private readonly defaults: Defaults) {}
  getConfiguration(section?: string) {
    const prefix = section ? `${section}.` : '';
    const values = () => ({ ...this.defaults, ...this.store.read() });
    return {
      get: <T>(key: string, fallback?: T) => {
        const all = values();
        const full = `${prefix}${key}`;
        return (full in all ? all[full] : fallback) as T;
      },
      has: (key: string) => `${prefix}${key}` in values(),
      inspect: (key: string) => ({ key: `${prefix}${key}`, globalValue: this.store.read()[`${prefix}${key}`], defaultValue: this.defaults[`${prefix}${key}`] }),
      update: async (key: string, value: unknown) => {
        const full = `${prefix}${key}`;
        const next = { ...this.store.read() };
        if (value === undefined) delete next[full];
        else next[full] = value;
        this.store.write(next);
        this.changes.fire({ affectsConfiguration: target => full === target || full.startsWith(`${target}.`) });
      },
    };
  }
}
