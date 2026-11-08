import { relative, sep } from 'node:path';
import { EventEmitter, DisposableImpl, type Event, type Disposable } from './events';
import { Uri } from './uri';
import { WorkspaceFs } from './workspaceFs';
import type { Configuration } from './configuration';

export interface WorkspaceFolder {
  readonly uri: Uri;
  readonly name: string;
  readonly index: number;
}

export class Workspace {
  readonly fs = new WorkspaceFs();
  private folders: WorkspaceFolder[] = [];
  private readonly foldersEmitter = new EventEmitter<void>();
  readonly onDidChangeWorkspaceFolders: Event<void> = this.foldersEmitter.event;

  private readonly trustEmitter = new EventEmitter<void>();
  readonly onDidGrantWorkspaceTrust: Event<void> = this.trustEmitter.event;

  private readonly textDocumentEmitter = new EventEmitter<{ document: unknown }>();
  readonly onDidChangeTextDocument: Event<{ document: unknown }> = this.textDocumentEmitter.event;

  private readonly openDocumentEmitter = new EventEmitter<unknown>();
  readonly onDidOpenTextDocument: Event<unknown> = this.openDocumentEmitter.event;

  private readonly closeDocumentEmitter = new EventEmitter<unknown>();
  readonly onDidCloseTextDocument: Event<unknown> = this.closeDocumentEmitter.event;

  private readonly saveDocumentEmitter = new EventEmitter<unknown>();
  readonly onDidSaveTextDocument: Event<unknown> = this.saveDocumentEmitter.event;

  isTrusted = true;
  name: string | undefined = 'arara-vibes';
  workspaceFile: Uri | undefined = undefined;
  textDocuments: unknown[] = [];

  constructor(private readonly config: Configuration, initialFolder?: string) {
    if (initialFolder) {
      this.folders = [{ uri: Uri.file(initialFolder), name: 'workspace', index: 0 }];
    }
  }

  get workspaceFolders(): readonly WorkspaceFolder[] | undefined {
    return this.folders.length ? this.folders : undefined;
  }

  setWorkspaceFolders(folders: string[]) {
    this.folders = folders.map((path, index) => ({
      uri: Uri.file(path),
      name: `folder-${index}`,
      index,
    }));
    this.foldersEmitter.fire();
  }

  getWorkspaceFolder(uri: Uri): WorkspaceFolder | undefined {
    return this.folders.find(f => uri.fsPath.startsWith(f.uri.fsPath));
  }

  getConfiguration(section?: string) {
    return this.config.getConfiguration(section);
  }

  get onDidChangeConfiguration() {
    return this.config.onDidChangeConfiguration;
  }

  asRelativePath(pathOrUri: string | Uri, includeWorkspaceFolder?: boolean): string {
    const targetPath = typeof pathOrUri === 'string' ? pathOrUri : pathOrUri.fsPath;
    const base = this.folders[0]?.uri.fsPath;
    if (!base) return targetPath;
    const rel = relative(base, targetPath).split(sep).join('/');
    if (includeWorkspaceFolder && this.folders[0]) {
      return `${this.folders[0].name}/${rel}`;
    }
    return rel;
  }

  registerTextDocumentContentProvider(_scheme: string, _provider: unknown): Disposable {
    return new DisposableImpl(() => {});
  }

  createFileSystemWatcher(_pattern: unknown) {
    const change = new EventEmitter<Uri>();
    const create = new EventEmitter<Uri>();
    const del = new EventEmitter<Uri>();
    return {
      onDidChange: change.event,
      onDidCreate: create.event,
      onDidDelete: del.event,
      dispose() {},
    };
  }

  async findFiles(): Promise<Uri[]> {
    return [];
  }

  async openTextDocument(uriOrFileName?: unknown): Promise<{ uri: Uri; getText(): string }> {
    const uri = typeof uriOrFileName === 'string' ? Uri.file(uriOrFileName) : (uriOrFileName as Uri) ?? Uri.file('/empty');
    return { uri, getText: () => '' };
  }

  async applyEdit(): Promise<boolean> {
    return true;
  }

  async saveAll(): Promise<boolean> {
    return true;
  }
}
