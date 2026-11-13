import { FsError, type DirEntry, type FileStat, type FileSystem } from '../core/ports';

interface Entry {
  bytes: Uint8Array;
  mtimeMs: number;
}

/** The demo's files: a `FileSystem` held in the page's memory, gone on reload. */
export interface MemoryFiles extends FileSystem {
  /** Adds `text` to the end of `path` (a log that grows). */
  append(path: string, text: string): void;
}

const encoder = new TextEncoder();

/** A file system of `files` (absolute path → text), in memory: writes change it until the page reloads. */
export function memoryFiles(files: Readonly<Record<string, string>>, now: () => number = Date.now): MemoryFiles {
  const store = new Map<string, Entry>(Object.entries(files).map(([path, text]) => [path, { bytes: encoder.encode(text), mtimeMs: now() }]));
  const isFolder = (path: string) => [...store.keys()].some((file) => file.startsWith(`${path.replace(/\/$/, '')}/`));
  const entry = (path: string) => {
    const found = store.get(path);
    if (found) return found;
    throw new FsError(isFolder(path) ? 'EISDIR' : 'ENOENT', path);
  };
  const write = (path: string, data: Uint8Array) => {
    if (isFolder(path)) throw new FsError('EISDIR', path);
    store.set(path, { bytes: data.slice(), mtimeMs: now() });
  };
  return {
    stat: async (path): Promise<FileStat> => {
      if (!store.has(path) && isFolder(path)) return { kind: 'directory', size: 0, mtimeMs: 0, id: path, executable: false };
      const { bytes, mtimeMs } = entry(path);
      return { kind: 'file', size: bytes.byteLength, mtimeMs, id: path, executable: false };
    },
    readFile: async (path, { maxBytes }) => {
      const { bytes } = entry(path);
      if (bytes.byteLength > maxBytes) throw new FsError('ETOOBIG', path);
      return bytes.slice();
    },
    realpath: async (path) => {
      if (!store.has(path) && !isFolder(path)) throw new FsError('ENOENT', path);
      return path;
    },
    readDir: async function* (path): AsyncIterable<DirEntry> {
      const prefix = `${path.replace(/\/$/, '')}/`;
      const names = new Map<string, DirEntry['kind']>();
      for (const file of store.keys()) {
        if (!file.startsWith(prefix)) continue;
        const [name, ...rest] = file.slice(prefix.length).split('/');
        names.set(name!, rest.length > 0 ? 'directory' : 'file');
      }
      for (const [name, kind] of names) yield { name, kind };
    },
    mkdir: async () => {},
    writeFileAtomic: async (path, data) => write(path, data),
    saveFile: async (path, data) => {
      const existed = store.has(path);
      write(path, data);
      return existed ? 'replaced' : 'created';
    },
    rename: async (from, to) => {
      store.set(to, entry(from));
      store.delete(from);
    },
    remove: async (path) => {
      for (const file of [...store.keys()]) if (file === path || file.startsWith(`${path}/`)) store.delete(file);
    },
    removeFile: async (path) => void store.delete(path),
    touch: async (path) => {
      entry(path).mtimeMs = now();
    },
    append: (path, text) => {
      const { bytes } = entry(path);
      const added = encoder.encode(text);
      const joined = new Uint8Array(bytes.byteLength + added.byteLength);
      joined.set(bytes);
      joined.set(added, bytes.byteLength);
      store.set(path, { bytes: joined, mtimeMs: now() });
    },
  };
}

