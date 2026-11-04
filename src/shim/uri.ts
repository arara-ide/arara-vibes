import { fileURLToPath, pathToFileURL } from 'node:url';
import { posix } from 'node:path';

export class Uri {
  private constructor(readonly scheme: string, readonly authority: string, readonly path: string, readonly query: string, readonly fragment: string) {}
  get fsPath() {
    return this.scheme === 'file' ? fileURLToPath(this.toString()) : this.path;
  }
  static file(path: string) {
    const url = pathToFileURL(path);
    return new Uri('file', '', decodeURIComponent(url.pathname), '', '');
  }
  static parse(value: string) {
    const url = new URL(value);
    return new Uri(url.protocol.slice(0, -1), url.host, decodeURIComponent(url.pathname), url.search.slice(1), url.hash.slice(1));
  }
  static joinPath(base: Uri, ...parts: string[]) {
    return base.with({ path: posix.join(base.path, ...parts) });
  }
  with(change: Partial<Pick<Uri, 'scheme' | 'authority' | 'path' | 'query' | 'fragment'>>) {
    return new Uri(change.scheme ?? this.scheme, change.authority ?? this.authority, change.path ?? this.path, change.query ?? this.query, change.fragment ?? this.fragment);
  }
  toString() {
    const url = new URL(`${this.scheme}://${this.authority}`);
    url.pathname = this.path.split('/').map(encodeURIComponent).join('/');
    url.search = this.query;
    url.hash = this.fragment;
    return url.toString();
  }
}
