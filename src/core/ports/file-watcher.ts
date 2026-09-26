import type { Unsubscribe } from './common';

export interface WatchEvent {
  path: string;
  kind: 'change' | 'rename' | 'delete';
}

/** Watches individual open files; events arrive coalesced and rate-capped. */
export interface FileWatcher {
  watch(path: string, listener: (event: WatchEvent) => void): Unsubscribe;
}
