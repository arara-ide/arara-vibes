import { resolve } from 'node:path';
import type { Disposable } from './events';
import type { Memento } from './memento';
import type { Secrets } from './secrets';
import { Uri } from './uri';
import { ExtensionMode } from './types';

export class GlobalState {
  constructor(private readonly memento: Memento) {}

  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.memento.get(key, defaultValue);
  }

  async update(key: string, value: unknown): Promise<void> {
    await this.memento.update(key, value);
  }

  keys(): readonly string[] {
    return this.memento.keys();
  }

  setKeysForSync(): void {}
}

export class ExtensionContext {
  readonly subscriptions: Disposable[] = [];
  readonly globalState: GlobalState;
  readonly extensionMode = ExtensionMode.Production;

  constructor(
    readonly extensionUri: Uri,
    readonly globalStorageUri: Uri,
    readonly logUri: Uri,
    readonly storageUri: Uri,
    readonly workspaceState: Memento,
    memento: Memento,
    readonly secrets: Secrets,
    readonly extension: { id: string; packageJSON: Record<string, unknown> },
  ) {
    this.globalState = new GlobalState(memento);
  }

  get extensionPath(): string {
    return this.extensionUri.fsPath;
  }

  asAbsolutePath(relativePath: string): string {
    return resolve(this.extensionUri.fsPath, relativePath);
  }
}
