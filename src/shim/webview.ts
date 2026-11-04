import { EventEmitter, type Event } from './events';
import { Uri } from './uri';

export interface WebviewOptions {
  enableScripts?: boolean;
  localResourceRoots?: readonly Uri[];
}

export class ShimWebview {
  private _html = '';
  options: WebviewOptions = {};
  cspSource = "'self' https: data: blob:";

  private readonly receiveEmitter = new EventEmitter<unknown>();
  readonly onDidReceiveMessage: Event<unknown> = this.receiveEmitter.event;

  private readonly toRendererEmitter = new EventEmitter<unknown>();
  readonly onMessageToRenderer: Event<unknown> = this.toRendererEmitter.event;

  get html(): string {
    return this._html;
  }

  set html(value: string) {
    this._html = value;
  }

  asWebviewUri(uri: Uri): Uri {
    return Uri.parse(`vscode-file://vscode-app${uri.path}`);
  }

  async postMessage(message: unknown): Promise<boolean> {
    this.toRendererEmitter.fire(message);
    return true;
  }

  receiveFromRenderer(message: unknown): void {
    this.receiveEmitter.fire(message);
  }
}

export class ShimWebviewView {
  readonly webview = new ShimWebview();
  title: string | undefined;
  description: string | undefined;
  badge: unknown;
  visible = true;

  private readonly visibilityEmitter = new EventEmitter<void>();
  readonly onDidChangeVisibility: Event<void> = this.visibilityEmitter.event;

  private readonly disposeEmitter = new EventEmitter<void>();
  readonly onDidDispose: Event<void> = this.disposeEmitter.event;

  constructor(readonly viewType: string) {}

  show(): void {
    if (!this.visible) {
      this.visible = true;
      this.visibilityEmitter.fire();
    }
  }

  dispose(): void {
    this.disposeEmitter.fire();
  }
}
