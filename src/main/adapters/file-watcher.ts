import { existsSync, watch, type FSWatcher } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { FsError, type FileWatcher, type Unsubscribe, type WatchEvent } from '../../core/ports';

type WatchFolder = (folder: string, listener: (type: string, filename: string | null) => void) => FSWatcher;

interface Folder {
  watcher: FSWatcher;
  /** Listeners by file name. */
  files: Map<string, Set<(event: WatchEvent) => void>>;
}

const watchFolder: WatchFolder = (folder, listener) =>
  watch(folder, { persistent: false }, (type, filename) => listener(type, filename));

/**
 * `FileWatcher` on `fs.watch` of the file's folder, filtered by name: watching the folder keeps
 * working when an editor or agent replaces the file by renaming a new one over it. Files in one
 * folder share one watch, so many open tabs cost one watch per folder.
 */
export class NodeFileWatcher implements FileWatcher {
  private readonly folders = new Map<string, Folder>();

  constructor(private readonly watchFn: WatchFolder = watchFolder) {}

  watch(path: string, listener: (event: WatchEvent) => void): Unsubscribe {
    const dir = dirname(path);
    const name = basename(path);
    const folder = this.folders.get(dir) ?? this.open(dir);
    const listeners = folder.files.get(name) ?? new Set();
    folder.files.set(name, listeners);
    const own = (event: WatchEvent) => listener(event);
    listeners.add(own);
    return () => {
      listeners.delete(own);
      if (listeners.size === 0) folder.files.delete(name);
      if (folder.files.size === 0) this.close(dir, folder);
    };
  }

  private open(dir: string): Folder {
    const files: Folder['files'] = new Map();
    let watcher: FSWatcher;
    try {
      watcher = this.watchFn(dir, (_type, filename) => {
        if (!existsSync(dir)) return lost();
        if (filename === null) return;
        const kind = existsSync(join(dir, filename)) ? 'change' : 'delete';
        for (const listener of [...(files.get(filename) ?? [])]) listener({ path: join(dir, filename), kind });
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      throw new FsError(code === 'ENOENT' ? 'ENOENT' : code === 'EACCES' ? 'EACCES' : 'EOTHER', dir);
    }
    const folder: Folder = { watcher, files };
    // The folder went away or became unreadable: every file in it hears once, then nothing more.
    const lost = () => {
      if (this.folders.get(dir) !== folder) return;
      this.close(dir, folder);
      for (const [name, listeners] of files) for (const listener of [...listeners]) listener({ path: join(dir, name), kind: 'lost' });
    };
    watcher.on('error', lost);
    this.folders.set(dir, folder);
    return folder;
  }

  private close(dir: string, folder: Folder): void {
    if (this.folders.get(dir) === folder) this.folders.delete(dir);
    folder.watcher.close();
  }
}
