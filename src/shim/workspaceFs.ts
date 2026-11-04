import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import type { Uri } from './uri';

export const FileType = {
  Unknown: 0,
  File: 1,
  Directory: 2,
  SymbolicLink: 64,
} as const;

export class WorkspaceFs {
  async readFile(uri: Uri): Promise<Uint8Array> {
    return fs.readFile(uri.fsPath);
  }

  async writeFile(uri: Uri, content: Uint8Array): Promise<void> {
    await fs.mkdir(dirname(uri.fsPath), { recursive: true });
    await fs.writeFile(uri.fsPath, Buffer.from(content));
  }

  async stat(uri: Uri): Promise<{ type: number; ctime: number; mtime: number; size: number }> {
    const s = await fs.stat(uri.fsPath);
    let type: number = FileType.Unknown;
    if (s.isFile()) type = FileType.File;
    else if (s.isDirectory()) type = FileType.Directory;
    else if (s.isSymbolicLink()) type = FileType.SymbolicLink;
    return {
      type,
      ctime: s.birthtimeMs,
      mtime: s.mtimeMs,
      size: s.size,
    };
  }

  async delete(uri: Uri, options?: { recursive?: boolean; useTrash?: boolean }): Promise<void> {
    await fs.rm(uri.fsPath, { recursive: options?.recursive ?? false, force: true });
  }

  async createDirectory(uri: Uri): Promise<void> {
    await fs.mkdir(uri.fsPath, { recursive: true });
  }

  async readDirectory(uri: Uri): Promise<[string, number][]> {
    const entries = await fs.readdir(uri.fsPath, { withFileTypes: true });
    return entries.map(e => {
      let type: number = FileType.Unknown;
      if (e.isFile()) type = FileType.File;
      else if (e.isDirectory()) type = FileType.Directory;
      else if (e.isSymbolicLink()) type = FileType.SymbolicLink;
      return [e.name, type];
    });
  }
}
