import { EventEmitter, type Event } from './events';
import type { JsonStore } from './jsonStore';

export class Secrets {
  private readonly changeEmitter = new EventEmitter<{ key: string }>();
  readonly onDidChange: Event<{ key: string }> = this.changeEmitter.event;

  constructor(private readonly fileStore: JsonStore) {}

  async get(key: string): Promise<string | undefined> {
    const data = this.fileStore.read();
    const val = data[key];
    return typeof val === 'string' ? val : undefined;
  }

  async store(key: string, value: string): Promise<void> {
    const data = this.fileStore.read();
    data[key] = value;
    this.fileStore.write(data);
    this.changeEmitter.fire({ key });
  }

  async delete(key: string): Promise<void> {
    const data = this.fileStore.read();
    if (key in data) {
      delete data[key];
      this.fileStore.write(data);
      this.changeEmitter.fire({ key });
    }
  }
}
