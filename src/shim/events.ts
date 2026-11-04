export interface Disposable { dispose(): void }
export type Event<T> = (listener: (value: T) => unknown) => Disposable;

export class DisposableImpl implements Disposable {
  constructor(private readonly callback: () => void) {}
  private done = false;
  dispose() {
    if (this.done) return;
    this.done = true;
    this.callback();
  }
  static from(...items: { dispose(): unknown }[]) {
    return new DisposableImpl(() => items.forEach(item => item.dispose()));
  }
}

export class EventEmitter<T> implements Disposable {
  private listeners = new Set<(value: T) => unknown>();
  readonly event: Event<T> = listener => {
    this.listeners.add(listener);
    return new DisposableImpl(() => this.listeners.delete(listener));
  };
  fire(value: T) {
    for (const listener of [...this.listeners]) listener(value);
  }
  dispose() {
    this.listeners.clear();
  }
}
