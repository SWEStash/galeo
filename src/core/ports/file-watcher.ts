import type { Unsubscribe } from './common';

export interface WatchEvent {
  path: string;
  kind: 'change' | 'rename' | 'delete';
}

/** Watches individual files. One save can arrive as several events; listeners re-read idempotently. */
export interface FileWatcher {
  watch(path: string, listener: (event: WatchEvent) => void): Unsubscribe;
}
