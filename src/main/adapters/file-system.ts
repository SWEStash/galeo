import { constants, type Dirent, type Stats } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { access, chmod, lstat, mkdir, open, opendir, readdir, realpath, rename, rm, stat, unlink, utimes, type FileHandle } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
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
        executable: process.platform !== 'win32' && (info.mode & 0o111n) !== 0n,
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

  async mkdir(path: string, { mode }: { mode: number }): Promise<void> {
    try {
      const first = await mkdir(path, { recursive: true, mode });
      // `mkdir`'s mode goes through the umask, and an existing directory keeps its own.
      for (let dir = path; ; dir = dirname(dir)) {
        await chmod(dir, mode);
        if (!first || dir === first || dirname(dir) === dir) break;
      }
    } catch (error) {
      throw toFsError(error, path);
    }
  }

  async rename(from: string, to: string): Promise<void> {
    try {
      await rename(from, to);
    } catch (error) {
      throw toFsError(error, from);
    }
  }

  async remove(path: string): Promise<void> {
    try {
      await rm(path, { recursive: true, force: true });
    } catch (error) {
      throw toFsError(error, path);
    }
  }

  async touch(path: string): Promise<void> {
    try {
      const now = new Date();
      await utimes(path, now, now);
    } catch (error) {
      throw toFsError(error, path);
    }
  }

  async saveFile(path: string, data: Uint8Array): Promise<'replaced' | 'in-place' | 'created'> {
    let real: string;
    try {
      real = await realpath(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw toFsError(error, path);
      await this.replace(path, data, null);
      return 'created';
    }
    let info: Awaited<ReturnType<typeof stat>>;
    try {
      info = await stat(real);
    } catch (error) {
      throw toFsError(error, path);
    }
    if (info.isDirectory()) throw new FsError('EISDIR', path);
    if (!info.isFile()) throw new FsError('ENOTFILE', path);
    // A rename would replace a file the reader may not write, as long as its folder allows it.
    try {
      await access(real, constants.W_OK);
    } catch (error) {
      throw toFsError(error, path);
    }
    if (info.nlink > 1 || !(await this.replace(real, data, info))) {
      try {
        await writeInPlace(real, data, info);
      } catch (error) {
        throw toFsError(error, path);
      }
      return 'in-place';
    }
    return 'replaced';
  }

  /**
   * Replaces `path` through a temp file beside it, which takes the old file's mode, owner and
   * group (`like`); a new file gets the default mode. False, with nothing changed, when the temp
   * file can't take that owner or group.
   */
  private async replace(path: string, data: Uint8Array, like: { mode: number; uid: number; gid: number } | null): Promise<boolean> {
    const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
    try {
      const handle = await open(temp, 'wx', like ? like.mode & 0o7777 : 0o666);
      try {
        if (like) {
          await handle.chmod(like.mode & 0o7777);
          if (process.platform !== 'win32') {
            const mine = await handle.stat();
            if (mine.uid !== like.uid || mine.gid !== like.gid) {
              try {
                await handle.chown(like.uid, like.gid);
              } catch {
                await handle.close();
                await rm(temp, { force: true });
                return false;
              }
            }
          }
        }
      } catch (error) {
        await handle.close();
        throw error;
      }
      await writeAndSync(handle, data);
      await rename(temp, path);
      await syncDirectory(dirname(path));
      await sweepStaleTemps(path);
      return true;
    } catch (error) {
      await rm(temp, { force: true });
      throw toFsError(error, path);
    }
  }

  async writeFileAtomic(path: string, data: Uint8Array, { mode }: { mode: number }): Promise<void> {
    const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
    try {
      const handle = await open(temp, 'wx', mode);
      try {
        await handle.writeFile(data);
        await handle.chmod(mode);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temp, path);
      await syncDirectory(dirname(path));
    } catch (error) {
      await rm(temp, { force: true });
      throw toFsError(error, path);
    }
    await sweepStaleTemps(path);
  }
}

/** A temp file older than this is a crashed save's: no write takes that long. */
const STALE_TEMP_MS = 60 * 60 * 1000;
const TEMP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Removes the temp files a crashed write of `path` left beside it: only names this file system
 * gives them (`.<name>.<uuid>.tmp`), only regular files the app's user owns, only old ones, and logs
 * each one. Best effort: the write it follows has already succeeded.
 */
async function sweepStaleTemps(path: string): Promise<void> {
  const dir = dirname(path);
  const prefix = `.${basename(path)}.`;
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith('.tmp') || !TEMP_ID.test(name.slice(prefix.length, -'.tmp'.length))) continue;
    const temp = join(dir, name);
    try {
      const info = await lstat(temp);
      const mine = process.getuid === undefined || info.uid === process.getuid();
      if (info.isFile() && mine && Date.now() - info.mtimeMs > STALE_TEMP_MS) {
        await unlink(temp);
        console.warn(`galeo: removed a temp file a crashed save left: ${temp}`);
      }
    } catch {
      // Gone already, or not ours to remove: left as it is.
    }
  }
}

/** Writes and flushes a file handle's whole content. */
async function writeAndSync(handle: FileHandle, data: Uint8Array): Promise<void> {
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * Writes over the file at `real` (already resolved) without replacing it. A symlink there now, or
 * another file, was swapped in after the checks: refused rather than followed.
 */
async function writeInPlace(real: string, data: Uint8Array, checked: { dev: number; ino: number }): Promise<void> {
  const handle = await open(real, constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (opened.dev !== checked.dev || opened.ino !== checked.ino) throw new FsError('EOTHER', real);
    await handle.truncate(0);
  } catch (error) {
    await handle.close();
    throw error;
  }
  await writeAndSync(handle, data);
}

/** Makes the rename durable. Windows can't open a directory for this, and doesn't need to. */
async function syncDirectory(dir: string): Promise<void> {
  if (process.platform === 'win32') return;
  const handle = await open(dir, constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
