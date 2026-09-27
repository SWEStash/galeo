/** `ENOTFILE`: a FIFO, device or socket (reads are limited to regular files, SR-12). */
export type FsErrorCode = 'ENOENT' | 'EACCES' | 'EISDIR' | 'ENOTDIR' | 'ENOTFILE' | 'ETOOBIG' | 'EOTHER';

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
  /** Reads a regular file (following symlinks), refusing (`ETOOBIG`) anything over `maxBytes`. */
  readFile(path: string, options: { maxBytes: number }): Promise<Uint8Array>;
  realpath(path: string): Promise<string>;
  /** Streams one directory's entries without following symlinks; callers bound the walk. */
  readDir(path: string): AsyncIterable<DirEntry>;
}
