import type { DocumentRecord } from '../../shared/documents';
import type { FileWatcher, Unsubscribe } from '../ports';

interface Watched {
  window: number;
  path: string;
  stop: Unsubscribe;
}

/**
 * Watches the file each open tab shows, so a change on disk reaches the tab (live reload). Only
 * open files are watched (SR-14): a tab that closes or navigates away stops its watch.
 */
export class DocumentWatches {
  private readonly watched = new Map<string, Watched>();

  constructor(
    private readonly deps: {
      watcher: FileWatcher;
      /** The file the window's tab shows changed, moved or went away. */
      changed: (window: number, id: string) => void;
    },
  ) {}

  /** Watches what the window's tabs show now, and nothing else of that window. */
  sync(window: number, records: readonly DocumentRecord[]): void {
    const wanted = new Map(records.filter((record) => record.kind !== 'settings').map((record) => [record.id, record.path]));
    for (const [id, watched] of this.watched) {
      if (watched.window !== window || wanted.get(id) === watched.path) continue;
      watched.stop();
      this.watched.delete(id);
    }
    for (const [id, path] of wanted) {
      const current = this.watched.get(id);
      if (current?.window === window) continue;
      // A tab that moved here from another window (ADR-019): its changes are this window's now.
      current?.stop();
      this.watched.delete(id);
      let stop: Unsubscribe;
      try {
        stop = this.deps.watcher.watch(path, () => this.deps.changed(window, id));
      } catch {
        // Unwatchable (a coalescing watcher polls instead); the tab still re-checks when shown.
        continue;
      }
      this.watched.set(id, { window, path, stop });
    }
  }
}
