import type { Unsubscribe } from './common';

export interface WatchEvent {
  path: string;
  /** `lost`: the watch stopped working (folder gone or unreadable); no more events follow. */
  kind: 'change' | 'rename' | 'delete' | 'lost';
}

/**
 * Watches individual files. One save can arrive as several events; listeners re-read idempotently.
 * Throws `FsError` when the file's folder can't be watched.
 */
export interface FileWatcher {
  watch(path: string, listener: (event: WatchEvent) => void): Unsubscribe;
}

/** Something happened to `name` in a watched folder (null: the system didn't say which), or the watch stopped working. */
export type FolderEvent = { kind: 'entry'; name: string | null } | { kind: 'lost' };

/** Watches a folder's own entries (not its subfolders'). Throws `FsError` when it can't be watched. */
export interface FolderWatcher {
  watchFolder(folder: string, listener: (event: FolderEvent) => void): Unsubscribe;
}
