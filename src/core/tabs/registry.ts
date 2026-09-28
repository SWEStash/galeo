import type { DocumentRecord } from '../../shared/documents';
import type { ScrollAnchor, TabSnapshot, TabView } from '../../shared/tabs';
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
}

interface Stored {
  id: string;
  window: number;
  entries: HistoryEntry[];
  index: number;
  zoom?: number;
}

/** A tab as a session keeps it: its history, where in it, and its zoom (absent at 100 %). */
export interface TabState {
  entries: HistoryEntry[];
  index: number;
  zoom?: number;
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
}

/** How many closed tabs per window Ctrl+Shift+T can bring back. */
const CLOSED_DEPTH = 25;

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

  /** `onChange` hears the window whose tabs changed, once per change, so main can push a snapshot. */
  constructor(
    private readonly randomId: () => string,
    private readonly onChange: (window: number) => void = () => {},
  ) {}

  /** Opens `path` (at `anchor`) after the window's active tab, or at the end when none is active. */
  open(path: string, window: number, anchor: string | null = null): DocumentRecord {
    const order = this.orderOf(window);
    const active = this.active.get(window);
    const position = active === undefined ? order.length : order.indexOf(active) + 1;
    return this.insert(window, [{ path, anchor }], 0, position);
  }

  get(id: string, window: number): DocumentRecord | undefined {
    const record = this.owned(id, window);
    return record && recordOf(record);
  }

  list(window: number): DocumentRecord[] {
    return (this.order.get(window) ?? []).map((id) => recordOf(this.records.get(id)!));
  }

  snapshot(window: number): TabSnapshot {
    const tabs = (this.order.get(window) ?? []).map((id): TabView => {
      const record = this.records.get(id)!;
      const position = record.entries[record.index]!.position;
      return { ...recordOf(record), ...(record.zoom ? { zoom: record.zoom } : {}), ...(position ? { position } : {}) };
    });
    return { revision: this.revisions.get(window) ?? 0, active: this.active.get(window) ?? null, tabs };
  }

  /** The window's tabs for the session file: history, positions, encodings, zoom (ADR-005). */
  exportWindow(window: number): WindowState {
    const order = this.order.get(window) ?? [];
    const active = this.active.get(window);
    return {
      active: active === undefined ? null : order.indexOf(active),
      tabs: order.map((id) => {
        const { entries, index, zoom } = this.records.get(id)!;
        return { entries: entries.map((entry) => ({ ...entry })), index, ...(zoom ? { zoom } : {}) };
      }),
    };
  }

  /** Opens a session's tabs in a window, after any it has, under new ids; the saved active one is active. */
  restoreWindow(window: number, state: WindowState): DocumentRecord[] {
    const restored = state.tabs.map((tab) => {
      const record = this.insert(window, tab.entries.map((entry) => ({ ...entry })), tab.index, this.orderOf(window).length);
      if (tab.zoom) this.records.get(record.id)!.zoom = tab.zoom;
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
    const closed = this.closed.get(window) ?? [];
    closed.push({ entries: record.entries, index: record.index, position });
    this.closed.set(window, closed.slice(-CLOSED_DEPTH));
    this.changed(window);
    return true;
  }

  /** Brings back the window's most recently closed tab, where it was, under a new id. */
  reopenClosed(window: number): DocumentRecord | null {
    const tab = this.closed.get(window)?.pop();
    return tab ? this.insert(window, tab.entries, tab.index, tab.position) : null;
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

  /** Moves the tab to `entry`, dropping any forward history. */
  navigate(id: string, window: number, entry: HistoryEntry): boolean {
    const record = this.owned(id, window);
    if (!record) return false;
    record.entries = [...record.entries.slice(0, record.index + 1), entry];
    record.index = record.entries.length - 1;
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

  private insert(window: number, entries: HistoryEntry[], index: number, position: number): DocumentRecord {
    let id = this.randomId();
    while (this.records.has(id)) id = this.randomId();
    const record = { id, window, entries, index };
    this.records.set(id, record);
    const order = this.orderOf(window);
    order.splice(Math.min(position, order.length), 0, id);
    this.changed(window);
    return recordOf(record);
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
  return { id: record.id, path: record.entries[record.index]!.path };
}
