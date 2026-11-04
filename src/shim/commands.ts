import { DisposableImpl, type Disposable } from './events';

export class Commands {
  private readonly handlers = new Map<string, (...args: unknown[]) => unknown>();
  private readonly fallbacks = new Map<string, (...args: unknown[]) => unknown>();
  registerCommand(id: string, handler: (...args: unknown[]) => unknown): Disposable {
    this.handlers.set(id, handler);
    return new DisposableImpl(() => {
      if (this.handlers.get(id) === handler) this.handlers.delete(id);
    });
  }
  setFallback(id: string, handler: (...args: unknown[]) => unknown) {
    this.fallbacks.set(id, handler);
  }
  async executeCommand(id: string, ...args: unknown[]) {
    const handler = this.handlers.get(id) ?? this.fallbacks.get(id);
    if (!handler) return undefined;
    return handler(...args);
  }
  async getCommands() {
    return [...this.handlers.keys()];
  }
}
