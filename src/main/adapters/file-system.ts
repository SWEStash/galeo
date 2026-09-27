import { constants, type Dirent, type Stats } from 'node:fs';
import { open, opendir, realpath, stat } from 'node:fs/promises';
import { FsError, type DirEntry, type EntryKind, type FileStat, type FileSystem, type FsErrorCode } from '../../core/ports';

const CODES: Record<string, FsErrorCode> = {
  ENOENT: 'ENOENT',
  EACCES: 'EACCES',
  EPERM: 'EACCES',
  EISDIR: 'EISDIR',
  ENOTDIR: 'ENOTDIR',
};

function toFsError(error: unknown, path: string): FsError {
  if (error instanceof FsError) return error;
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return new FsError((code && CODES[code]) || 'EOTHER', path);
}

function kindOf(entry: Stats | Dirent): EntryKind {
  if (entry.isSymbolicLink()) return 'symlink';
  if (entry.isFile()) return 'file';
  if (entry.isDirectory()) return 'directory';
  return 'other';
}

// Opening a FIFO for reading would block until a writer appears; non-blocking open returns at
// once and the regular-file check refuses it. Windows has no such flag (or FIFOs).
const READ_FLAGS = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0);

/** `FileSystem` on Node's `fs`. Every failure rejects with an `FsError`. */
export class NodeFileSystem implements FileSystem {
  async stat(path: string): Promise<FileStat> {
    try {
      const info = await stat(path, { bigint: true });
      return {
        kind: info.isFile() ? 'file' : info.isDirectory() ? 'directory' : 'other',
        size: Number(info.size),
        mtimeMs: Number(info.mtimeMs),
        id: `${info.dev}:${info.ino}`,
      };
    } catch (error) {
      throw toFsError(error, path);
    }
  }

  async readFile(path: string, { maxBytes }: { maxBytes: number }): Promise<Uint8Array> {
    try {
      const handle = await open(path, READ_FLAGS);
      try {
        const info = await handle.stat();
        if (info.isDirectory()) throw new FsError('EISDIR', path);
        if (!info.isFile()) throw new FsError('ENOTFILE', path);
        if (info.size > maxBytes) throw new FsError('ETOOBIG', path);
        // Read one byte past the cap, so a file that grew since `stat` is still refused.
        const buffer = new Uint8Array(Math.min(info.size, maxBytes) + 1);
        let length = 0;
        for (;;) {
          const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
          if (bytesRead === 0) break;
          length += bytesRead;
          if (length > maxBytes) throw new FsError('ETOOBIG', path);
          if (length === buffer.length) break;
        }
        return buffer.subarray(0, length);
      } finally {
        await handle.close();
      }
    } catch (error) {
      throw toFsError(error, path);
    }
  }

  async realpath(path: string): Promise<string> {
    try {
      return await realpath(path);
    } catch (error) {
      throw toFsError(error, path);
    }
  }

  async *readDir(path: string): AsyncIterable<DirEntry> {
    let dir;
    try {
      dir = await opendir(path);
    } catch (error) {
      throw toFsError(error, path);
    }
    try {
      for await (const entry of dir) yield { name: entry.name, kind: kindOf(entry) };
    } catch (error) {
      throw toFsError(error, path);
    }
  }
}
