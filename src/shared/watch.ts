/** One file in the watched folder's list (ADR-034): opened by `id`; the page never gets its path. */
interface WatchEntry {
  id: string;
  name: string;
  /** Its folder inside the watched one, `/`-separated; '' for the watched folder itself. */
  folder: string;
  kind: 'new' | 'changed';
  /** When it arrived or last changed, in ms since the epoch. */
  at: number;
  opened: boolean;
}

/** What the window's watched folder panel shows; the event sends null once the window stops watching. */
export interface WatchState {
  /** The folder as shown (`~/…` under the home folder). */
  shown: string;
  /** The folder's own name, for the status bar. */
  name: string;
  status: 'starting' | 'watching' | 'missing' | 'denied';
  /** Some folder is checked every few seconds rather than watched. */
  polling: boolean;
  panel: boolean;
  /** Newest first. */
  entries: WatchEntry[];
  /** Older entries were dropped to keep the newest 200. */
  truncated: boolean;
}
