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
  /** Any execute bit set (POSIX); always false on Windows, where extensions decide (SR-05). */
  executable: boolean;
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
  /** Creates the directory and missing parents; the created ones and the target end up with `mode`. */
  mkdir(path: string, options: { mode: number }): Promise<void>;
  /** Replaces the file whole or not at all (temp file, fsync, rename), leaving it with `mode`. */
  writeFileAtomic(path: string, data: Uint8Array, options: { mode: number }): Promise<void>;
  /**
   * Writes a document the reader saved (ADR-013, SR-15), on the file a symlink points to:
   * `replaced` whole (temp file with the file's mode, owner and group, `fsync`, rename), or
   * `in-place` when a rename would change what the file is (it has other hard links, or the temp
   * file can't take its owner or group), or `created` when the file is gone. A folder it can't
   * write to fails with `EACCES` and leaves the file as it was.
   */
  saveFile(path: string, data: Uint8Array): Promise<'replaced' | 'in-place' | 'created'>;
  /** Moves a file, replacing whatever is at `to` (same file system). */
  rename(from: string, to: string): Promise<void>;
  /** Deletes a file or a folder with everything in it, symlinks as links; a missing path is fine. */
  remove(path: string): Promise<void>;
  /** Sets an existing file's or folder's modification time to now. */
  touch(path: string): Promise<void>;
}
