export type FsErrorCode = 'ENOENT' | 'EACCES' | 'EISDIR' | 'ENOTDIR' | 'ETOOBIG' | 'EOTHER';

/** The only error a `FileSystem` rejects with, so core can branch on `code`. */
export class FsError extends Error {
  constructor(
    readonly code: FsErrorCode,
    readonly path: string,
  ) {
    super(`${code}: ${path}`);
    this.name = 'FsError';
  }
}

export type EntryKind = 'file' | 'directory' | 'symlink' | 'other';

export interface FileStat {
  kind: EntryKind;
  size: number;
  mtimeMs: number;
  /** Identity that survives renames (inode on POSIX); changes when a file is replaced. */
  id: string;
}

export interface DirEntry {
  name: string;
  kind: EntryKind;
}

/** Local file access. Paths are absolute; all failures reject with `FsError`. */
export interface FileSystem {
  stat(path: string): Promise<FileStat>;
  /** Reads a regular file, refusing (`ETOOBIG`) anything over `maxBytes`. */
  readFile(path: string, options: { maxBytes: number }): Promise<Uint8Array>;
  realpath(path: string): Promise<string>;
  /** Streams one directory's entries without following symlinks; callers bound the walk. */
  readDir(path: string): AsyncIterable<DirEntry>;
}
