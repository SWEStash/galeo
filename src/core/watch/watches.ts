import { fileName, shownPath } from '../../shared/paths';
import type { WatchState } from '../../shared/watch';
import type { SelectionGrants } from '../documents/selections';
import { FsError, type Clock, type FileSystem, type FolderWatcher, type Unsubscribe } from '../ports';
import type { WindowWatch } from '../session/model';
import { FolderWatch } from './folder';

/** At most one update per window this often: a busy folder can't flood the page. */
const UPDATE_MS = 250;

interface FolderWatchesDeps {
  fs: Pick<FileSystem, 'readDir' | 'stat' | 'realpath'>;
  watcher: FolderWatcher;
  clock: Clock;
  grants: SelectionGrants;
  /** The home folder, from which the folder is shown (`~/…`). */
  home: string;
  /** Names the window's profile adds to the quick-open skip list. */
  exclude: (window: number) => readonly string[];
  /** The files the window's tabs show: an entry for one of them counts as opened. */
  tabs: (window: number) => readonly string[];
  send: (window: number, state: WatchState | null) => void;
  /** What the window's session keeps changed (the folder, or its panel). */
  changed: (window: number) => void;
}

interface Watched {
  watch: FolderWatch;
  panel: boolean;
  lastSent: number;
  pending: Unsubscribe | null;
}

/**
 * The folder each window watches (ADR-034): one per window, granted by `--watch` or main's folder
 * dialog. The page gets names and opaque ids, never a path; an id opens only while its entry is in
 * the last list sent.
 */
export class FolderWatches {
  private readonly windows = new Map<number, Watched>();

  constructor(private readonly deps: FolderWatchesDeps) {}

  /** Watches `folder` in the window, in place of what it watched; resolves once watching started. */
  async start(window: number, folder: string, panel = true): Promise<void> {
    this.drop(window);
    const watched: Watched = {
      panel,
      lastSent: -Infinity,
      pending: null,
      watch: new FolderWatch(folder, {
        fs: this.deps.fs,
        watcher: this.deps.watcher,
        clock: this.deps.clock,
        exclude: this.deps.exclude(window),
        onChange: () => this.schedule(window, watched),
      }),
    };
    this.windows.set(window, watched);
    this.push(window, watched);
    this.deps.changed(window);
    await watched.watch.start();
    // Its real path is what the session keeps.
    if (this.windows.get(window) === watched) this.deps.changed(window);
  }

  /** A saved watch comes back only for an absolute path that is still a folder (SR-17). */
  async restore(window: number, saved: WindowWatch): Promise<void> {
    try {
      if ((await this.deps.fs.stat(saved.folder)).kind !== 'directory') return;
    } catch (error) {
      if (error instanceof FsError) return;
      throw error;
    }
    await this.start(window, saved.folder, saved.panel);
  }

  stop(window: number): void {
    if (!this.windows.has(window)) return;
    this.drop(window);
    this.deps.send(window, null);
    this.deps.changed(window);
  }

  setPanel(window: number, open: boolean): void {
    const watched = this.windows.get(window);
    if (!watched || watched.panel === open) return;
    watched.panel = open;
    this.deps.changed(window);
  }

  /** What the session keeps for the window, or null when it watches nothing. */
  saved(window: number): WindowWatch | null {
    const watched = this.windows.get(window);
    return watched ? { folder: watched.watch.path, panel: watched.panel } : null;
  }

  /** The window's panel as it is now (a page that reloads asks); null when it watches nothing. */
  state(window: number): WatchState | null {
    const watched = this.windows.get(window);
    return watched ? this.offer(window, watched) : null;
  }

  /**
   * The path of an entry the window was offered, or null for an id it wasn't (or no longer is), or
   * for an entry that no longer resolves inside the folder.
   */
  async choose(window: number, id: string): Promise<string | null> {
    const watched = this.windows.get(window);
    const path = watched ? this.deps.grants.choose(window, 'watch', id) : null;
    return path !== null && (await watched!.watch.stillInside(path)) ? path : null;
  }

  /** The entries not opened yet that still resolve inside the folder, oldest first. */
  async unopened(window: number): Promise<string[]> {
    const watched = this.windows.get(window);
    if (!watched) return [];
    const paths = watched.watch.unopened();
    const inside = await Promise.all(paths.map((path) => watched.watch.stillInside(path)));
    return paths.filter((_, index) => inside[index]);
  }

  /** The window's tabs changed: entries for the files they show are opened. */
  tabsChanged(window: number): void {
    const watched = this.windows.get(window);
    if (!watched) return;
    for (const path of this.deps.tabs(window)) watched.watch.markOpened(path);
  }

  closeWindow(window: number): void {
    this.drop(window);
  }

  private drop(window: number): void {
    const watched = this.windows.get(window);
    if (!watched) return;
    this.windows.delete(window);
    watched.pending?.();
    watched.watch.stop();
    this.deps.grants.offer(window, 'watch', []);
  }

  private schedule(window: number, watched: Watched): void {
    if (watched.pending || this.windows.get(window) !== watched) return;
    const wait = Math.max(0, watched.lastSent + UPDATE_MS - this.deps.clock.now());
    watched.pending = this.deps.clock.setTimeout(() => {
      watched.pending = null;
      if (this.windows.get(window) === watched) this.push(window, watched);
    }, wait);
  }

  private push(window: number, watched: Watched): void {
    watched.lastSent = this.deps.clock.now();
    this.deps.send(window, this.offer(window, watched));
  }

  private offer(window: number, watched: Watched): WatchState {
    // Live reload of an open tab, or a file opened another way, counts as opened.
    const open = new Set(this.deps.tabs(window));
    const state = watched.watch.state();
    for (const entry of state.entries) if (!entry.opened && open.has(entry.path)) watched.watch.markOpened(entry.path);
    const { entries, status, polling, truncated } = watched.watch.state();
    const ids = this.deps.grants.offer(window, 'watch', entries.map((entry) => entry.path));
    return {
      shown: shownPath(watched.watch.path, this.deps.home),
      name: fileName(watched.watch.path),
      status,
      polling,
      panel: watched.panel,
      entries: entries.map(({ path: _path, ...entry }, index) => ({ ...entry, id: ids[index]!.id })),
      truncated,
    };
  }
}
