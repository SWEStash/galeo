import type { DocumentRecord } from '../../shared/documents';
import type { ReaderWidth, ScrollAnchor, TabSnapshot, TabView, TabViewState } from '../../shared/tabs';
import type { WhatwgEncoding } from '../text/decode';

/**
 * A place in a tab's history: a file, where a link pointed in it (an anchor, or the top), and
 * where the reader last was, once the window has said.
 */
export interface HistoryEntry {
  path: string;
  anchor: string | null;
  position?: ScrollAnchor;
  /** The encoding the reader chose for this file ("Reopen with encoding…"). */
  encoding?: WhatwgEncoding;
  /** The view the reader chose, whether a log follows its end, and where a split's divider is. */
  view?: TabViewState['view'];
  follow?: true;
  ratio?: number;
  /** The reader's table options (ADR-021). */
  table?: TabViewState['table'];
  /**
   * The reader handed this file over (command line, Files, a second launch) or confirmed editing
   * it: Ctrl+E edits it without asking (ADR-015). Main only; never in a snapshot.
   */
  chosen?: true;
}

interface Stored {
  id: string;
  window: number;
  entries: HistoryEntry[];
  index: number;
  zoom?: number;
  /** Its own reader width; absent while it follows the setting. */
  width?: ReaderWidth;
  /** The window's settings tab: no file, never in the session. */
  settings?: true;
  /** It was rendering when its window's renderer crashed: not rendered again until the reader asks. */
  crashed?: true;
}

/** A tab as a session keeps it: its history, where in it, its zoom (absent at 100 %) and reader width. */
export interface TabState {
  entries: HistoryEntry[];
  index: number;
  zoom?: number;
  /** Its own reader width; absent while it follows the setting. */
  width?: ReaderWidth;
}

/** A window's tabs as a session keeps them, and which was shown. */
export interface WindowState {
  tabs: TabState[];
  active: number | null;
}

interface Closed {
  entries: HistoryEntry[];
  index: number;
  position: number;
  zoom?: number;
  /** Its own reader width; absent while it follows the setting. */
  width?: ReaderWidth;
  /** When it closed, on the registry's own clock (`stamp`). */
  at: number;
}

/** How many closed tabs per window Ctrl+Shift+T can bring back. */
const CLOSED_DEPTH = 25;
/** History entries a tab keeps; the oldest go first. Sessions hold this many (their schema says so too). */
export const HISTORY_DEPTH = 50;

/**
 * The tabs open in each window, as main knows them (ADR-002): which exist, their order and the
 * window they belong to. Reads go through a tab, so a window can only read what was opened for it.
 * Each tab keeps its own back/forward history. Every change bumps the window's revision, so the
 * window's mirror can tell a newer snapshot from a stale one.
 */
export class TabRegistry {
  private readonly records = new Map<string, Stored>();
  private readonly order = new Map<number, string[]>();
  private readonly active = new Map<number, string>();
  private readonly closed = new Map<number, Closed[]>();
  private readonly revisions = new Map<number, number>();
  private clock = 0;

  /** `onChange` hears the window whose tabs changed, once per change, so main can push a snapshot. */
  constructor(
    private readonly randomId: () => string,
    private readonly onChange: (window: number) => void = () => {},
  ) {}

  /** Opens `path` (at `anchor`) after the tab `after` (null: first), else the active one, else at the end. */
  open(path: string, window: number, anchor: string | null = null, after?: string | null): DocumentRecord {
    const order = this.orderOf(window);
    if (after === null) return this.insert(window, [{ path, anchor }], 0, 0);
    const next = (after !== undefined && order.includes(after) ? after : undefined) ?? this.active.get(window);
    const position = next === undefined ? order.length : order.indexOf(next) + 1;
    return this.insert(window, [{ path, anchor }], 0, position);
  }

  get(id: string, window: number): DocumentRecord | undefined {
    const record = this.owned(id, window);
    return record && recordOf(record);
  }

  /** The window's tab showing `path` now (its current history entry), if any. */
  find(path: string, window: number): DocumentRecord | undefined {
    const id = (this.order.get(window) ?? []).find((each) => {
      const record = this.records.get(each)!;
      return !record.settings && record.entries[record.index]!.path === path;
    });
    return id === undefined ? undefined : recordOf(this.records.get(id)!);
  }

  list(window: number): DocumentRecord[] {
    return (this.order.get(window) ?? []).map((id) => recordOf(this.records.get(id)!));
  }

  snapshot(window: number): TabSnapshot {
    const tabs = (this.order.get(window) ?? []).map((id): TabView => {
      const record = this.records.get(id)!;
      const { position, view, follow, ratio, table } = record.entries[record.index]!;
      return {
        ...recordOf(record),
        ...(record.zoom ? { zoom: record.zoom } : {}),
        ...(record.width ? { width: record.width } : {}),
        ...(position ? { position } : {}),
        ...(view ? { view } : {}),
        ...(follow ? { follow } : {}),
        ...(ratio ? { ratio } : {}),
        ...(table ? { table } : {}),
        ...(record.crashed ? { crashed: true as const } : {}),
      };
    });
    return { revision: this.revisions.get(window) ?? 0, active: this.active.get(window) ?? null, tabs };
  }

  /** The window's tabs for the session file: history, positions, encodings, zoom, reader width (ADR-005). */
  exportWindow(window: number): WindowState {
    const order = (this.order.get(window) ?? []).filter((id) => !this.records.get(id)!.settings);
    const active = this.active.get(window);
    const shown = active === undefined ? -1 : order.indexOf(active);
    return {
      active: shown < 0 ? null : shown,
      tabs: order.map((id) => {
        const { entries, index, zoom, width } = this.records.get(id)!;
        return { entries: entries.map((entry) => ({ ...entry })), index, ...(zoom ? { zoom } : {}), ...(width ? { width } : {}) };
      }),
    };
  }

  /** Shows the window's settings tab, opening it after the shown tab if it isn't open yet. */
  openSettings(window: number): DocumentRecord {
    const order = this.orderOf(window);
    const existing = order.find((id) => this.records.get(id)!.settings);
    const active = this.active.get(window);
    const record =
      existing === undefined
        ? this.insert(window, [{ path: '', anchor: null }], 0, active === undefined ? order.length : order.indexOf(active) + 1, true)
        : recordOf(this.records.get(existing)!);
    this.activate(record.id, window);
    return record;
  }

  /** Opens a session's tabs in a window, after any it has, under new ids; the saved active one is active. */
  restoreWindow(window: number, state: WindowState): DocumentRecord[] {
    const restored = state.tabs.map((tab) => {
      const record = this.insert(window, tab.entries.map((entry) => ({ ...entry })), tab.index, this.orderOf(window).length);
      this.keepLook(record.id, tab);
      return record;
    });
    const active = state.active === null ? undefined : restored[state.active];
    if (active) this.activate(active.id, window);
    return restored;
  }

  /** The tab's zoom (1 is 100 %); part of the snapshot, so the window's mirror follows it. */
  setZoom(id: string, window: number, zoom: number): boolean {
    const record = this.owned(id, window);
    if (!record) return false;
    if (zoom === 1) delete record.zoom;
    else record.zoom = zoom;
    this.changed(window);
    return true;
  }

  /** The tab's own reader width, or null to follow the setting again; part of the snapshot, like zoom. */
  setWidth(id: string, window: number, width: ReaderWidth | null): boolean {
    const record = this.owned(id, window);
    if (!record) return false;
    if (width === null) delete record.width;
    else record.width = width;
    this.changed(window);
    return true;
  }

  /** A restored or reopened tab takes back its zoom and reader width. */
  private keepLook(id: string, { zoom, width }: { zoom?: number; width?: ReaderWidth }): void {
    const record = this.records.get(id)!;
    if (zoom) record.zoom = zoom;
    if (width) record.width = width;
  }

  /** The window says it shows `id` now (it activates tabs itself, then reports it). */
  activate(id: string, window: number): boolean {
    if (!this.owned(id, window)) return false;
    this.active.set(window, id);
    this.changed(window);
    return true;
  }

  close(id: string, window: number): boolean {
    const record = this.owned(id, window);
    if (!record) return false;
    const order = this.orderOf(window);
    const position = order.indexOf(id);
    order.splice(position, 1);
    this.records.delete(id);
    if (this.active.get(window) === id) this.active.delete(window);
    if (record.settings) {
      this.changed(window);
      return true;
    }
    const closed = this.closed.get(window) ?? [];
    closed.push({
      entries: record.entries,
      index: record.index,
      position,
      ...(record.zoom ? { zoom: record.zoom } : {}),
      ...(record.width ? { width: record.width } : {}),
      at: this.stamp(),
    });
    this.closed.set(window, closed.slice(-CLOSED_DEPTH));
    this.changed(window);
    return true;
  }

  /**
   * A point on the clock closed tabs are stamped with, increasing with every call: main stamps
   * closed windows with it, so Ctrl+Shift+T can tell which closed last.
   */
  stamp(): number {
    return ++this.clock;
  }

  /** When the window last closed a tab it can still reopen, or null. */
  closedAt(window: number): number | null {
    return this.closed.get(window)?.at(-1)?.at ?? null;
  }

  /** Brings back the window's most recently closed tab, where it was, under a new id. */
  reopenClosed(window: number): DocumentRecord | null {
    const tab = this.closed.get(window)?.pop();
    if (!tab) return null;
    const record = this.insert(window, tab.entries, tab.index, tab.position);
    this.keepLook(record.id, tab);
    return record;
  }

  /** Moves the tab to `position` in its window's order, clamped to the ends. */
  move(id: string, window: number, position: number): boolean {
    if (!this.owned(id, window)) return false;
    const order = this.orderOf(window);
    order.splice(order.indexOf(id), 1);
    order.splice(Math.max(0, Math.min(position, order.length)), 0, id);
    this.changed(window);
    return true;
  }

  /**
   * Moves the tab, as it is and under its id, to `position` in another window, shown there (ADR-019).
   * Not a close: the window it left can't reopen it. Never the settings tab.
   */
  transfer(id: string, from: number, to: number, position: number): boolean {
    const record = this.owned(id, from);
    if (!record || record.settings || from === to) return false;
    const source = this.orderOf(from);
    source.splice(source.indexOf(id), 1);
    if (this.active.get(from) === id) this.active.delete(from);
    record.window = to;
    const target = this.orderOf(to);
    target.splice(Math.max(0, Math.min(position, target.length)), 0, id);
    this.active.set(to, id);
    this.changed(from);
    this.changed(to);
    return true;
  }

  /** Moves the tab to `entry`, dropping any forward history. A link within the same file keeps its choice. */
  navigate(id: string, window: number, entry: HistoryEntry): boolean {
    const record = this.owned(id, window);
    if (!record) return false;
    const { chosen: _chosen, ...next } = entry;
    const current = record.entries[record.index]!;
    const kept = current.chosen && current.path === entry.path ? { chosen: true as const } : {};
    record.entries = [...record.entries.slice(0, record.index + 1), { ...next, ...kept }].slice(-HISTORY_DEPTH);
    record.index = record.entries.length - 1;
    this.changed(window);
    return true;
  }

  /** Whether the reader handed over, or confirmed, the file the tab shows now (ADR-015). */
  chosen(id: string, window: number): boolean {
    const record = this.owned(id, window);
    return record?.entries[record.index]!.chosen === true;
  }

  /** The file the tab shows now is the reader's choice; false for a tab the window doesn't have. */
  markChosen(id: string, window: number): boolean {
    const record = this.owned(id, window);
    if (!record) return false;
    const entry = record.entries[record.index]!;
    if (entry.chosen) return true;
    entry.chosen = true;
    this.changed(window);
    return true;
  }

  /** Where the reader is in the tab's current entry. Not a change: no revision, no snapshot. */
  setPosition(id: string, window: number, position: ScrollAnchor): boolean {
    const record = this.owned(id, window);
    if (!record) return false;
    record.entries[record.index]!.position = position;
    return true;
  }

  /** How the reader shows the tab's current entry. Not a change either: the session keeps it. */
  setViewState(id: string, window: number, state: TabViewState): boolean {
    const record = this.owned(id, window);
    if (!record) return false;
    const entry = record.entries[record.index]!;
    delete entry.view;
    delete entry.follow;
    delete entry.ratio;
    delete entry.table;
    if (state.view) entry.view = state.view;
    if (state.follow) entry.follow = true;
    if (state.ratio) entry.ratio = state.ratio;
    if (state.table) entry.table = { ...state.table };
    return true;
  }

  position(id: string, window: number): ScrollAnchor | null {
    const record = this.owned(id, window);
    return record?.entries[record.index]!.position ?? null;
  }

  /** Chooses how the entry's file is decoded; null goes back to detecting it. */
  setEncoding(id: string, window: number, encoding: WhatwgEncoding | null): boolean {
    const record = this.owned(id, window);
    if (!record) return false;
    const entry = record.entries[record.index]!;
    if (encoding) entry.encoding = encoding;
    else delete entry.encoding;
    this.changed(window);
    return true;
  }

  encoding(id: string, window: number): WhatwgEncoding | null {
    const record = this.owned(id, window);
    return record?.entries[record.index]!.encoding ?? null;
  }

  back(id: string, window: number): HistoryEntry | null {
    return this.step(id, window, -1);
  }

  forward(id: string, window: number): HistoryEntry | null {
    return this.step(id, window, 1);
  }

  closeWindow(window: number): void {
    for (const id of this.order.get(window) ?? []) this.records.delete(id);
    this.order.delete(window);
    this.active.delete(window);
    this.closed.delete(window);
    this.changed(window);
  }

  private insert(window: number, entries: HistoryEntry[], index: number, position: number, settings = false): DocumentRecord {
    let id = this.randomId();
    while (this.records.has(id)) id = this.randomId();
    const record: Stored = { id, window, entries, index, ...(settings ? { settings: true as const } : {}) };
    this.records.set(id, record);
    const order = this.orderOf(window);
    order.splice(Math.min(position, order.length), 0, id);
    this.changed(window);
    return recordOf(record);
  }

  /** The tab was rendering when its window's renderer crashed (ADR-002). */
  markCrashed(id: string, window: number): boolean {
    const record = this.owned(id, window);
    if (!record) return false;
    record.crashed = true;
    this.changed(window);
    return true;
  }

  /** The reader asked to render the tab again. */
  clearCrashed(id: string, window: number): boolean {
    const record = this.owned(id, window);
    if (!record) return false;
    delete record.crashed;
    this.changed(window);
    return true;
  }

  private step(id: string, window: number, step: -1 | 1): HistoryEntry | null {
    const record = this.owned(id, window);
    const target = record && record.entries[record.index + step];
    if (!record || !target) return null;
    record.index += step;
    this.changed(window);
    return { ...target };
  }

  private orderOf(window: number): string[] {
    let order = this.order.get(window);
    if (!order) this.order.set(window, (order = []));
    return order;
  }

  private changed(window: number): void {
    this.revisions.set(window, (this.revisions.get(window) ?? 0) + 1);
    this.onChange(window);
  }

  private owned(id: string, window: number): Stored | undefined {
    const record = this.records.get(id);
    return record && record.window === window ? record : undefined;
  }
}

function recordOf(record: Stored): DocumentRecord {
  return { id: record.id, path: record.entries[record.index]!.path, ...(record.settings ? { kind: 'settings' as const } : {}) };
}
