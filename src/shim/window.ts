import { EventEmitter, DisposableImpl, type Disposable, type Event } from './events';
import { ShimWebview, ShimWebviewView } from './webview';
import type { Uri } from './uri';

export interface StatusBarItem extends Disposable {
  id: string;
  text: string;
  tooltip: string | undefined;
  command: string | undefined;
  show(): void;
  hide(): void;
}

export interface WebviewViewProvider {
  resolveWebviewView(webviewView: ShimWebviewView, context: unknown, token: unknown): void | Promise<void>;
}

export interface WebviewPanel extends Disposable {
  readonly webview: ShimWebview;
  title: string;
  iconPath?: unknown;
  reveal(): void;
  readonly onDidDispose: Event<void>;
}

export class Window {
  activeTerminal = undefined;
  activeTextEditor = undefined;
  visibleTextEditors: unknown[] = [];
  tabGroups = { all: [] };
  terminals: unknown[] = [];
  state = { focused: true };

  private readonly windowStateEmitter = new EventEmitter<{ focused: boolean }>();
  readonly onDidChangeWindowState: Event<{ focused: boolean }> = this.windowStateEmitter.event;

  private readonly activeEditorEmitter = new EventEmitter<unknown>();
  readonly onDidChangeActiveTextEditor: Event<unknown> = this.activeEditorEmitter.event;

  private readonly selectionEmitter = new EventEmitter<unknown>();
  readonly onDidChangeTextEditorSelection: Event<unknown> = this.selectionEmitter.event;

  private readonly terminalEmitter = new EventEmitter<unknown>();
  readonly onDidChangeActiveTerminal: Event<unknown> = this.terminalEmitter.event;

  private readonly closeTerminalEmitter = new EventEmitter<unknown>();
  readonly onDidCloseTerminal: Event<unknown> = this.closeTerminalEmitter.event;

  private readonly terminalStartEmitter = new EventEmitter<unknown>();
  readonly onDidStartTerminalShellExecution: Event<unknown> = this.terminalStartEmitter.event;

  private readonly terminalEndEmitter = new EventEmitter<unknown>();
  readonly onDidEndTerminalShellExecution: Event<unknown> = this.terminalEndEmitter.event;

  readonly providers = new Map<string, WebviewViewProvider>();
  readonly views = new Map<string, ShimWebviewView>();

  registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider): Disposable {
    this.providers.set(viewId, provider);
    const existing = this.views.get(viewId);
    if (existing) {
      void provider.resolveWebviewView(existing, {}, {});
    }
    return new DisposableImpl(() => {
      this.providers.delete(viewId);
    });
  }

  resolveView(viewId: string): ShimWebviewView {
    let view = this.views.get(viewId);
    if (!view) {
      view = new ShimWebviewView(viewId);
      this.views.set(viewId, view);
    }
    const provider = this.providers.get(viewId);
    if (provider) {
      void provider.resolveWebviewView(view, {}, {});
    }
    return view;
  }

  createWebviewPanel(_viewType: string, title: string): WebviewPanel {
    const webview = new ShimWebview();
    const disposeEmitter = new EventEmitter<void>();
    return {
      webview,
      title,
      reveal() {},
      onDidDispose: disposeEmitter.event,
      dispose() {
        disposeEmitter.fire();
      },
    };
  }

  createOutputChannel(name: string) {
    return {
      name,
      append() {},
      appendLine() {},
      clear() {},
      show() {},
      hide() {},
      dispose() {},
    };
  }

  createQuickPick() {
    const valueEmitter = new EventEmitter<string>();
    const acceptEmitter = new EventEmitter<void>();
    const hideEmitter = new EventEmitter<void>();
    return {
      items: [],
      placeholder: '',
      value: '',
      onDidChangeValue: valueEmitter.event,
      onDidAccept: acceptEmitter.event,
      onDidHide: hideEmitter.event,
      show() {},
      hide() {},
      dispose() {},
    };
  }

  async showInformationMessage<T extends string>(message: string, ...items: T[]): Promise<T | undefined> {
    return items[0];
  }

  async showWarningMessage<T extends string>(message: string, ...items: T[]): Promise<T | undefined> {
    return items[0];
  }

  async showErrorMessage<T extends string>(message: string, ...items: T[]): Promise<T | undefined> {
    return items[0];
  }

  async showQuickPick<T>(items: T[] | Promise<T[]>): Promise<T | undefined> {
    const resolved = await items;
    return resolved[0];
  }

  async showInputBox(): Promise<string | undefined> {
    return undefined;
  }

  async showOpenDialog(): Promise<Uri[] | undefined> {
    return undefined;
  }

  async showSaveDialog(): Promise<Uri | undefined> {
    return undefined;
  }

  async showTextDocument(): Promise<{ document: unknown }> {
    return { document: {} };
  }

  setStatusBarMessage(text: string): Disposable {
    return new DisposableImpl(() => {});
  }

  createStatusBarItem(id = 'default'): StatusBarItem {
    return {
      id,
      text: '',
      tooltip: undefined,
      command: undefined,
      show() {},
      hide() {},
      dispose() {},
    };
  }

  createTextEditorDecorationType(): Disposable {
    return new DisposableImpl(() => {});
  }

  createTerminal(nameOrOptions?: string | { name?: string }): { name: string; sendText(): void; show(): void; dispose(): void } {
    const name = typeof nameOrOptions === 'string' ? nameOrOptions : nameOrOptions?.name ?? 'Terminal';
    return {
      name,
      sendText() {},
      show() {},
      dispose() {},
    };
  }

  async withProgress<R>(
    _options: unknown,
    task: (progress: { report(value: { message?: string; increment?: number }): void }, token: { isCancellationRequested: boolean }) => Promise<R>,
  ): Promise<R> {
    return task({ report() {} }, { isCancellationRequested: false });
  }
}
