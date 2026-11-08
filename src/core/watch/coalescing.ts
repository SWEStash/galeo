import { FsError, type Clock, type FileSystem, type FileWatcher, type Unsubscribe, type WatchEvent } from '../ports';
import { burst } from './burst';
/** How often a file is polled while its folder can't be watched. */
const POLL_MS = 1000;

interface CoalescingWatcherDeps {
  inner: FileWatcher;
  clock: Clock;
  fs: Pick<FileSystem, 'stat'>;
}

/**
 * Wraps a `FileWatcher` so that a save, a truncate-then-write or a stream of appends reaches the
 * listener as a few events, never an intermediate one alone. Where the folder can't be watched
 * (it's missing, the watch limit is reached, the file system doesn't notify) the file is polled,
 * and watched again as soon as that works.
 */
export class CoalescingWatcher implements FileWatcher {
  constructor(private readonly deps: CoalescingWatcherDeps) {}

  watch(path: string, listener: (event: WatchEvent) => void): Unsubscribe {
    const { clock, fs, inner } = this.deps;
    let stopped = false;
    let kind: WatchEvent['kind'] = 'change';
    let unwatch: Unsubscribe | null = null;
    let cancelPoll: Unsubscribe | null = null;
    let identity: string | null = null;

    const delivery = burst(clock, () => {
      if (!stopped) listener({ path, kind });
    });

    const note = (next: WatchEvent['kind']): void => {
      if (stopped) return;
      kind = next;
      delivery.note();
    };

    const identify = async (): Promise<string> => {
      try {
        const stat = await fs.stat(path);
        return `${stat.id}:${stat.size}:${stat.mtimeMs}`;
      } catch (error) {
        if (error instanceof FsError) return 'missing';
        throw error;
      }
    };

    const poll = async (): Promise<void> => {
      cancelPoll = null;
      if (stopped) return;
      // Watched again: a change made while polling still has to be reported once.
      const watching = tryWatch();
      const now = await identify();
      if (stopped) return;
      if (identity !== null && now !== identity) note(now === 'missing' ? 'delete' : 'change');
      identity = now;
      if (!watching) cancelPoll = clock.setTimeout(() => void poll(), POLL_MS);
    };

    const startPolling = (): void => {
      unwatch = null;
      void identify().then((now) => {
        identity ??= now;
      });
      cancelPoll ??= clock.setTimeout(() => void poll(), POLL_MS);
    };

    function tryWatch(): boolean {
      try {
        unwatch = inner.watch(path, (event) => {
          if (event.kind !== 'lost') return note(event.kind);
          note('change');
          startPolling();
        });
        return true;
      } catch (error) {
        if (!(error instanceof FsError)) throw error;
        return false;
      }
    }

    if (!tryWatch()) startPolling();

    return () => {
      stopped = true;
      delivery.cancel();
      cancelPoll?.();
      unwatch?.();
    };
  }
}
