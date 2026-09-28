import {
  FsError,
  type DirEntry,
  type FileStat,
  type FileSystem,
  type FsErrorCode,
} from '../../../src/core/ports';

/**
 * An in-memory tree built from `{ '/abs/path': content }`; parent directories are implied.
 * Symlinks and per-path errors can be added to exercise failure branches.
 */
export class FakeFileSystem implements FileSystem {
  private readonly files = new Map<string, Uint8Array>();
  private readonly links = new Map<string, string>();
  private readonly failures = new Map<string, FsErrorCode>();
  private readonly directories = new Set<string>();
  private readonly modes = new Map<string, number>();
  private readonly executables = new Set<string>();

  constructor(files: Record<string, string | Uint8Array> = {}) {
    for (const [path, content] of Object.entries(files)) this.write(path, content);
  }

  write(path: string, content: string | Uint8Array): void {
    this.files.set(path, typeof content === 'string' ? new TextEncoder().encode(content) : content);
  }

  delete(path: string): void {
    this.files.delete(path);
  }

  symlink(path: string, target: string): void {
    this.links.set(path, target);
  }

  makeExecutable(path: string): void {
    this.executables.add(path);
  }

  failWith(path: string, code: FsErrorCode): void {
    this.failures.set(path, code);
  }

  async stat(path: string): Promise<FileStat> {
    this.throwIfFailing(path);
    const resolved = this.resolve(path);
    const content = this.files.get(resolved);
    const executable = this.executables.has(resolved);
    if (content) return { kind: 'file', size: content.byteLength, mtimeMs: 0, id: resolved, executable };
    if (this.isDirectory(resolved)) return { kind: 'directory', size: 0, mtimeMs: 0, id: resolved, executable };
    throw new FsError('ENOENT', path);
  }

  async readFile(path: string, { maxBytes }: { maxBytes: number }): Promise<Uint8Array> {
    this.throwIfFailing(path);
    const resolved = this.resolve(path);
    const content = this.files.get(resolved);
    if (!content) throw new FsError(this.isDirectory(resolved) ? 'EISDIR' : 'ENOENT', path);
    if (content.byteLength > maxBytes) throw new FsError('ETOOBIG', path);
    return content;
  }

  async realpath(path: string): Promise<string> {
    await this.stat(path);
    return this.resolve(path);
  }

  async *readDir(path: string): AsyncIterable<DirEntry> {
    this.throwIfFailing(path);
    if (!this.isDirectory(path)) throw new FsError(this.files.has(path) ? 'ENOTDIR' : 'ENOENT', path);
    const prefix = `${path}/`;
    const entries = new Map<string, DirEntry>();
    for (const file of this.files.keys()) {
      if (!file.startsWith(prefix)) continue;
      const [name, ...rest] = file.slice(prefix.length).split('/') as [string, ...string[]];
      entries.set(name, { name, kind: rest.length ? 'directory' : 'file' });
    }
    for (const link of this.links.keys()) {
      if (link.startsWith(prefix) && !link.slice(prefix.length).includes('/')) {
        entries.set(link.slice(prefix.length), { name: link.slice(prefix.length), kind: 'symlink' });
      }
    }
    yield* [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async mkdir(path: string, { mode }: { mode: number }): Promise<void> {
    this.throwIfFailing(path);
    if (this.files.has(path)) throw new FsError('ENOTDIR', path);
    for (let dir = path; dir !== '/' && dir !== ''; dir = dir.slice(0, dir.lastIndexOf('/'))) {
      if (!this.directories.has(dir)) this.modes.set(dir, mode);
      this.directories.add(dir);
    }
    this.modes.set(path, mode);
  }

  async writeFileAtomic(path: string, data: Uint8Array, { mode }: { mode: number }): Promise<void> {
    this.throwIfFailing(path);
    const parent = path.slice(0, path.lastIndexOf('/'));
    if (parent && !this.isDirectory(parent)) throw new FsError('ENOENT', path);
    if (this.isDirectory(path)) throw new FsError('EISDIR', path);
    this.files.set(path, data.slice());
    this.modes.set(path, mode);
  }

  async rename(from: string, to: string): Promise<void> {
    this.throwIfFailing(from);
    const content = this.files.get(from);
    if (!content) throw new FsError('ENOENT', from);
    this.files.delete(from);
    this.files.set(to, content);
    const mode = this.modes.get(from);
    this.modes.delete(from);
    if (mode !== undefined) this.modes.set(to, mode);
  }

  /** The mode a directory or file was last created or written with. */
  modeOf(path: string): number | undefined {
    return this.modes.get(path);
  }

  private throwIfFailing(path: string): void {
    const code = this.failures.get(path);
    if (code) throw new FsError(code, path);
  }

  private resolve(path: string): string {
    for (const [link, target] of this.links) {
      if (path === link || path.startsWith(`${link}/`)) return target + path.slice(link.length);
    }
    return path;
  }

  private isDirectory(path: string): boolean {
    if (this.directories.has(path)) return true;
    const prefix = `${path}/`;
    return [...this.files.keys()].some((file) => file.startsWith(prefix));
  }
}
