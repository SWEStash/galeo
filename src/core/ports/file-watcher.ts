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
