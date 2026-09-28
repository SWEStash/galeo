import { existsSync, watch, type FSWatcher } from 'node:fs';
import { basename, dirname } from 'node:path';
import { FsError, type FileWatcher, type Unsubscribe, type WatchEvent } from '../../core/ports';

/**
 * `FileWatcher` on `fs.watch` of the file's folder, filtered by name: watching the folder keeps
 * working when an editor or agent replaces the file by renaming a new one over it.
 */
export class NodeFileWatcher implements FileWatcher {
  watch(path: string, listener: (event: WatchEvent) => void): Unsubscribe {
    const name = basename(path);
    let watcher: FSWatcher;
    try {
      watcher = watch(dirname(path), { persistent: false }, (_type, filename) => {
        if (filename !== name) return;
        listener({ path, kind: existsSync(path) ? 'change' : 'delete' });
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      throw new FsError(code === 'ENOENT' ? 'ENOENT' : code === 'EACCES' ? 'EACCES' : 'EOTHER', path);
    }
    // The folder went away or became unreadable: nothing more to report.
    watcher.on('error', () => watcher.close());
    return () => watcher.close();
  }
}
