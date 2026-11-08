import { fileName, joinPath } from '../../shared/paths';
import { isKnownType } from '../formats/registry';
import { BUILT_IN_EXCLUDES, walk } from '../quick-open/walker';
import { FsError, type Clock, type FileSystem, type FolderEvent, type FolderWatcher, type Unsubscribe } from '../ports';
import { burst, type Burst } from './burst';

/** ADR-034 §4 and SR-14: how deep, how many folders watched (the rest polled), how many entries kept. */
export const WATCH_LIMITS: Readonly<WatchLimits> = { depth: 4, folders: 1_000, entries: 200, pollMs: 3_000 };

interface WatchLimits {
  depth: number;
  folders: number;
  entries: number;
  pollMs: number;
}

/** Names remembered as seen (present at the start, or listed since) so a later change reads as *changed*. */
const SEEN_MAX = 100_000;

interface WatchedEntry {
  path: string;
  name: string;
  /** Its folder inside the watched one, `/`-separated; `''` for the watched folder itself. */
  folder: string;
  kind: 'new' | 'changed';
  /** When it last arrived or changed, on the watch's clock. */
  at: number;
  opened: boolean;
}

type WatchStatus = 'starting' | 'watching' | 'missing' | 'denied';

interface FolderWatchState {
  status: WatchStatus;
  /** Some folder is checked every few seconds rather than watched. */
  polling: boolean;
  /** Newest first. */
  entries: WatchedEntry[];
  /** Older entries were dropped to keep the newest `entries` limit. */
  truncated: boolean;
}

interface FolderWatchDeps {
  fs: Pick<FileSystem, 'readDir' | 'stat' | 'realpath'>;
  watcher: FolderWatcher;
  clock: Clock;
  /** Names skipped besides the built-in ones (the quick-open setting). */
  exclude: readonly string[];
  /** Something in the state changed. */
  onChange: () => void;
  limits?: Partial<WatchLimits>;
}

/**
 * One window's watched folder (ADR-034): the files of a type galeo opens that are created or
 * changed in it after the start, to 4 folders deep, newest first. It reads no file content: it
 * lists names, `stat`s them, and never lists a file whose real path leaves the folder. Folders past
 * the watch limit, or that can't be watched, are polled. A folder that goes away is checked until
 * it comes back; the list is kept.
 */
export class FolderWatch {
  private root: string;
  private status: WatchStatus = 'starting';
  /** By path relative to the root; the Map's order is the order they arrived, oldest first. */
  private readonly entries = new Map<string, WatchedEntry>();
  private truncated = false;
  private readonly seen = new Set<string>();
  /** Watched folders by relative path, with their unwatch; polled ones with their last listing. */
  private readonly watched = new Map<string, Unsubscribe>();
  private readonly polled = new Map<string, Map<string, string> | null>();
  private readonly bursts = new Map<string, Burst>();
  /** Entries heard of while the first walk runs: classified once it knows what was there. */
  private pending: Set<string> | null = null;
  private generation = 0;
  private pollTimer: Unsubscribe | null = null;
  private stopped = false;
  private readonly skip: Set<string>;
  private readonly limits: WatchLimits;

  constructor(
    private readonly folder: string,
    private readonly deps: FolderWatchDeps,
  ) {
    this.root = folder;
    this.skip = new Set([...BUILT_IN_EXCLUDES, ...deps.exclude]);
    this.limits = { ...WATCH_LIMITS, ...deps.limits };
  }

  /** The folder as galeo resolved it (its real path, once it could). */
  get path(): string {
    return this.root;
  }

  /** Records what is there, then watches; resolves once watching (or found missing or unreadable). */
  async start(): Promise<void> {
    const generation = this.reset();
    const { fs, clock } = this.deps;
    try {
      const root = await fs.realpath(this.folder);
      if ((await fs.stat(root)).kind !== 'directory') throw new FsError('ENOTDIR', root);
      if (generation !== this.generation) return;
      this.root = root;
      this.pending = new Set();
      const walker = walk(fs, root, { clock, exclude: this.deps.exclude, maxDepth: this.limits.depth, onFolder: (relative) => this.watchFolder(relative) });
      for (let step = await walker.next(); !step.done; step = await walker.next()) {
        if (generation !== this.generation) return;
        for (const file of step.value) this.remember(file);
      }
    } catch (error) {
      if (!(error instanceof FsError)) throw error;
      if (generation === this.generation) this.unavailable(error.code === 'EACCES' ? 'denied' : 'missing');
      return;
    }
    if (generation !== this.generation) return;
    this.status = 'watching';
    const pending = [...(this.pending ?? [])];
    this.pending = null;
    this.deps.onChange();
    for (const relative of pending) void this.classify(relative, generation);
  }

  state(): FolderWatchState {
    return { status: this.status, polling: this.polled.size > 0, entries: [...this.entries.values()].reverse(), truncated: this.truncated };
  }

  /** A tab of the window shows `path`: its entry, if any, is marked opened. */
  markOpened(path: string): void {
    for (const entry of this.entries.values()) {
      if (entry.path !== path || entry.opened) continue;
      entry.opened = true;
      this.deps.onChange();
    }
  }

  /** The entries not opened yet, oldest first (*Open all new*). */
  unopened(): string[] {
    return [...this.entries.values()].filter((entry) => !entry.opened).map((entry) => entry.path);
  }

  stop(): void {
    this.stopped = true;
    this.reset();
    this.pollTimer?.();
    this.pollTimer = null;
  }

  /** Drops every watch, poll and pending delivery; returns the new generation (older async work is stale). */
  private reset(): number {
    for (const unwatch of this.watched.values()) unwatch();
    this.watched.clear();
    this.polled.clear();
    for (const delivery of this.bursts.values()) delivery.cancel();
    this.bursts.clear();
    this.pending = null;
    return ++this.generation;
  }

  private unavailable(status: 'missing' | 'denied'): void {
    this.reset();
    this.status = status;
    this.deps.onChange();
    this.schedulePoll();
  }

  private full(relative: string): string {
    return relative ? joinPath(this.root, ...relative.split('/')) : this.root;
  }

  private remember(relative: string): void {
    if (this.seen.size < SEEN_MAX) this.seen.add(relative);
  }

  private watchFolder(relative: string): void {
    if (this.stopped || this.watched.has(relative) || this.polled.has(relative)) return;
    if (this.watched.size < this.limits.folders) {
      try {
        const generation = this.generation;
        this.watched.set(relative, this.deps.watcher.watchFolder(this.full(relative), (event) => this.heard(relative, event, generation)));
        return;
      } catch (error) {
        if (!(error instanceof FsError)) throw error;
      }
    }
    this.polled.set(relative, null);
    void this.poll(relative, this.generation);
    this.schedulePoll();
  }

  private heard(folder: string, event: FolderEvent, generation: number): void {
    if (this.stopped || generation !== this.generation) return;
    if (event.kind === 'lost') return this.lost(folder);
    const { name } = event;
    if (name === null || this.skip.has(name)) return;
    const relative = folder ? `${folder}/${name}` : name;
    if (this.pending) return void this.pending.add(relative);
    let delivery = this.bursts.get(relative);
    if (!delivery) {
      delivery = burst(this.deps.clock, () => {
        this.bursts.delete(relative);
        void this.classify(relative, generation);
      });
      this.bursts.set(relative, delivery);
    }
    delivery.note();
  }

  private lost(folder: string): void {
    if (folder === '') return this.unavailable('missing');
    this.watched.get(folder)?.();
    this.watched.delete(folder);
    this.polled.delete(folder);
  }

  /** What `relative` is now: a file to list, a new folder to watch, or nothing (gone, skipped, outside). */
  private async classify(relative: string, generation: number): Promise<void> {
    const path = this.full(relative);
    const depth = relative.split('/').length;
    let kind: string;
    try {
      kind = (await this.deps.fs.stat(path)).kind;
    } catch (error) {
      if (error instanceof FsError) return;
      throw error;
    }
    if (generation !== this.generation) return;
    if (kind === 'file') return this.list(relative, path, generation);
    if (kind !== 'directory' || depth > this.limits.depth || this.watched.has(relative) || this.polled.has(relative)) return;
    // A symlinked folder is never entered: its real path isn't where it is listed.
    if ((await this.realpath(path)) !== path || generation !== this.generation) return;
    await this.arrivedFolder(relative, path, generation);
  }

  /** A folder created (or moved in) after the start: watched, and its files are new. */
  private async arrivedFolder(relative: string, path: string, generation: number): Promise<void> {
    const { fs, clock } = this.deps;
    const walker = walk(fs, path, {
      clock,
      exclude: this.deps.exclude,
      maxDepth: this.limits.depth - relative.split('/').length,
      onFolder: (inner) => {
        if (generation === this.generation) this.watchFolder(inner ? `${relative}/${inner}` : relative);
      },
    });
    try {
      for (let step = await walker.next(); !step.done; step = await walker.next()) {
        for (const file of step.value) {
          if (generation !== this.generation) return;
          await this.list(`${relative}/${file}`, joinPath(path, ...file.split('/')), generation);
        }
      }
    } catch (error) {
      if (!(error instanceof FsError)) throw error;
    }
  }

  private async list(relative: string, path: string, generation: number): Promise<void> {
    if (!isKnownType(path)) return;
    const real = await this.realpath(path);
    if (real === null || !this.inside(real) || generation !== this.generation) return;
    const previous = this.entries.get(relative);
    const kind = previous && !previous.opened ? previous.kind : this.seen.has(relative) ? 'changed' : 'new';
    const slash = relative.lastIndexOf('/');
    this.entries.delete(relative);
    this.entries.set(relative, { path, name: fileName(path), folder: slash < 0 ? '' : relative.slice(0, slash), kind, at: this.deps.clock.now(), opened: false });
    this.remember(relative);
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.limits.entries) break;
      this.entries.delete(oldest);
      this.truncated = true;
    }
    this.deps.onChange();
  }

  private async realpath(path: string): Promise<string | null> {
    try {
      return await this.deps.fs.realpath(path);
    } catch (error) {
      if (error instanceof FsError) return null;
      throw error;
    }
  }

  private inside(path: string): boolean {
    return path.startsWith(`${this.root}/`) || path.startsWith(`${this.root}\\`);
  }

  private schedulePoll(): void {
    if (this.pollTimer || this.stopped) return;
    if (this.status !== 'missing' && this.status !== 'denied' && this.polled.size === 0) return;
    this.pollTimer = this.deps.clock.setTimeout(() => void this.tick(), this.limits.pollMs);
  }

  private async tick(): Promise<void> {
    this.pollTimer = null;
    if (this.stopped) return;
    const generation = this.generation;
    if (this.status === 'missing' || this.status === 'denied') {
      // Back, or readable again: watched afresh, the list kept.
      await this.start();
    } else {
      for (const relative of [...this.polled.keys()]) await this.poll(relative, generation);
    }
    this.schedulePoll();
  }

  /** Lists a polled folder; what is new or different since its last listing is classified. */
  private async poll(relative: string, generation: number): Promise<void> {
    const { fs } = this.deps;
    const folder = this.full(relative);
    const now = new Map<string, string>();
    try {
      for await (const entry of fs.readDir(folder)) {
        if (this.skip.has(entry.name)) continue;
        try {
          const stat = await fs.stat(joinPath(folder, entry.name));
          now.set(entry.name, `${stat.kind}:${stat.id}:${stat.size}:${stat.mtimeMs}`);
        } catch (error) {
          if (!(error instanceof FsError)) throw error;
        }
      }
    } catch (error) {
      if (!(error instanceof FsError)) throw error;
      if (generation === this.generation) this.lost(relative);
      return;
    }
    if (generation !== this.generation || !this.polled.has(relative)) return;
    const before = this.polled.get(relative);
    this.polled.set(relative, now);
    if (!before) return;
    for (const [name, signature] of now) {
      if (before.get(name) !== signature) await this.classify(relative ? `${relative}/${name}` : name, generation);
    }
  }
}
