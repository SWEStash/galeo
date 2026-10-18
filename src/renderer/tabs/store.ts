import type { Separator, SeparatorChoice } from '../../shared/csv';
import type { GaleoApi } from '../../shared/contracts';
import type { DocumentContent, DocumentRecord, TextEncoding } from '../../shared/documents';
import type { FormatId, ViewMode } from '../../shared/formats';
import { widthStep } from '../document/width';
import { zoomStep } from '../document/zoom';
import type { ReaderWidth, ScrollAnchor, TabSnapshot, TabViewState } from '../../shared/tabs';
import { ignoreClosedTab } from './closed-tab';

/** What the tab bar and status bar show about a tab, as its document reports it. */
export interface TabStatus {
  state: DocumentContent['state'];
  format: FormatId | null;
  view: ViewMode | null;
  encoding: TextEncoding | null;
  /** The file's lines, in the source view only (the others wrap to the window). */
  lines: number | null;
  /** Words of prose (Markdown once rendered, and `.txt`); null where counting words means nothing. */
  words: number | null;
  /** A log following its end. */
  follow: boolean;
  /** In edit mode (ADR-013). */
  editing: boolean;
  /** Edited, with changes not saved yet. */
  dirty: boolean;
  /** While a table shows: its separator choice, the one the reader found (Auto's pick), its header (ADR-021). */
  table?: { separator: SeparatorChoice; found: Separator | null; header: boolean } | null;
}

export interface TabsView {
  revision: number;
  tabs: DocumentRecord[];
  /** The tab this window shows; the window decides it and tells main (ADR-002). */
  active: string | null;
  /** Tabs with rendered content: the active one and the warm ones. The rest are hibernated. */
  rendered: ReadonlySet<string>;
  /** How many times main said a tab's file changed; each one reads it again. */
  reads: ReadonlyMap<string, number>;
  statuses: ReadonlyMap<string, TabStatus>;
  /** Each tab's zoom (1 when absent); zoom is per tab and scales the document only. */
  zooms: ReadonlyMap<string, number>;
  /** Each tab's own reader width; absent while it follows the `measure` setting. */
  widths: ReadonlyMap<string, ReaderWidth>;
  /** Tabs that took a new version of their file from disk within the last second (UX F4 `↻`). */
  reloaded: ReadonlySet<string>;
  /** Tabs that were rendering when the window's renderer crashed: not rendered until the reader asks (ADR-002). */
  crashed: ReadonlySet<string>;
}

/** How long a tab shows that it reloaded. */
export const RELOADED_MS = 1000;

export type TabsApi = Pick<
  GaleoApi['tabs'],
  | 'snapshot'
  | 'activated'
  | 'close'
  | 'move'
  | 'reopenClosed'
  | 'position'
  | 'zoom'
  | 'width'
  | 'viewState'
  | 'renderAgain'
  | 'onChanged'
  | 'onDemote'
  | 'onStale'
>;

export interface TabStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): TabsView;
  /** Pulls main's tabs and follows its snapshots from then on. */
  start(): Promise<void>;
  stop(): void;
  activate(id: string): void;
  /** Closes the tab; one with unsaved changes closes only if the guard agrees (ADR-013). */
  close(id: string): void;
  /** What `close` asks before closing a tab with unsaved changes. */
  setCloseGuard(guard: ((id: string) => Promise<boolean>) | null): void;
  /** Main owns the order: the new order shows once its snapshot arrives. */
  move(id: string, position: number): void;
  reopenClosed(): void;
  /** The reader scrolled a tab: kept here for its next wake, and reported to main for history and sessions. */
  moved(id: string, position: ScrollAnchor): void;
  positionOf(id: string): ScrollAnchor | null;
  /** How the tab's document is shown: the reader's chosen view and follow state (the session keeps it). */
  viewStateOf(id: string): TabViewState;
  setViewState(id: string, state: TabViewState): void;
  setStatus(id: string, status: TabStatus): void;
  /** Reads the tab again, keeping its place (a changed file, or another encoding). */
  reread(id: string): void;
  zoom(id: string, direction: 'in' | 'out' | 'reset'): void;
  /** Steps the tab's reader width from its own or, without one, from the `measure` setting. */
  width(id: string, direction: 'wider' | 'narrower' | 'reset' | 'full', setting: ReaderWidth): void;
  /** The tab now shows a new version of its file. */
  reloaded(id: string): void;
  /** Renders a tab that crashed the window, in the source view if the reader picked it. */
  renderAgain(id: string, view?: 'source'): void;
}

/**
 * This window's mirror of main's tab registry, for `useSyncExternalStore` (ADR-006). Main owns which
 * tabs exist and their order; a snapshot replaces the mirror only if its revision is newer. Which
 * tab is active is decided here, at once, and reported afterwards.
 */
export function createTabStore(api: TabsApi): TabStore {
  let view: TabsView = {
    revision: -1,
    tabs: [],
    active: null,
    rendered: new Set(),
    reads: new Map(),
    statuses: new Map(),
    zooms: new Map(),
    widths: new Map(),
    reloaded: new Set(),
    crashed: new Set(),
  };
  const reloadTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const positions = new Map<string, ScrollAnchor>();
  const viewStates = new Map<string, TabViewState>();
  let unsubscribe: (() => void)[] = [];
  /** A tab to activate as soon as a snapshot has it (a reopened one, before main's snapshot). */
  let wanted: string | null = null;
  /** Activations reported to main that it hasn't answered yet; until then its snapshots may predate them. */
  let reporting = 0;
  const listeners = new Set<() => void>();

  const set = (next: Partial<TabsView>) => {
    const merged = { ...view, ...next };
    // Rendered tabs and read counts only name tabs that still exist; the active one is always rendered.
    const ids = new Set(merged.tabs.map((tab) => tab.id));
    const rendered = new Set([...merged.rendered].filter((id) => ids.has(id)));
    if (merged.active) rendered.add(merged.active);
    const own = <V,>(map: ReadonlyMap<string, V>) => new Map([...map].filter(([id]) => ids.has(id)));
    const reloaded = new Set([...merged.reloaded].filter((id) => ids.has(id)));
    view = { ...merged, rendered, reloaded, reads: own(merged.reads), statuses: own(merged.statuses), zooms: own(merged.zooms), widths: own(merged.widths) };
    for (const id of positions.keys()) if (!ids.has(id)) positions.delete(id);
    for (const id of viewStates.keys()) if (!ids.has(id)) viewStates.delete(id);
    for (const listener of listeners) listener();
  };

  const activateLocally = (active: string | null, tabs: DocumentRecord[], revision: number) => {
    set({ revision, tabs, active });
    if (!active) return;
    reporting++;
    void api.activated(active).finally(() => reporting--);
  };

  const closeNow = (id: string) => {
    const index = view.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    // Gone at once: a quick second close acts on what is shown now. Main hears of the close
    // before the next activation, so its snapshot for that one no longer has the tab.
    void api.close(id);
    const tabs = view.tabs.filter((tab) => tab.id !== id);
    if (id === view.active) {
      const next = view.tabs[index + 1] ?? view.tabs[index - 1];
      activateLocally(next?.id ?? null, tabs, view.revision);
    } else {
      set({ tabs });
    }
  };
  let closeGuard: ((id: string) => Promise<boolean>) | null = null;

  const demote = (ids: string[]) => {
    const rendered = new Set(view.rendered);
    // A tab with unsaved changes stays: its editor is where they are (ADR-013).
    for (const id of ids) if (id !== view.active && !view.statuses.get(id)?.dirty) rendered.delete(id);
    set({ rendered });
  };

  const reread = (id: string) => {
    if (!view.tabs.some((tab) => tab.id === id)) return;
    set({ reads: new Map(view.reads).set(id, (view.reads.get(id) ?? 0) + 1) });
  };

  const apply = (snapshot: TabSnapshot) => {
    if (snapshot.revision <= view.revision) return;
    const ids = snapshot.tabs.map((tab) => tab.id);
    // Main holds each tab's zoom and width, and the last position it heard of: what a restored tab starts from.
    const zooms = new Map(snapshot.tabs.flatMap((tab) => (tab.zoom ? [[tab.id, tab.zoom] as const] : [])));
    const widths = new Map(snapshot.tabs.flatMap((tab) => (tab.width ? [[tab.id, tab.width] as const] : [])));
    const crashed = new Set(snapshot.tabs.flatMap((tab) => (tab.crashed ? [tab.id] : [])));
    for (const tab of snapshot.tabs) {
      if (tab.position && !positions.has(tab.id)) positions.set(tab.id, tab.position);
      // Main's is the entry the tab shows now: after a navigation, another entry's.
      viewStates.set(tab.id, {
        ...(tab.view ? { view: tab.view } : {}),
        ...(tab.follow ? { follow: tab.follow } : {}),
        ...(tab.ratio ? { ratio: tab.ratio } : {}),
        ...(tab.table ? { table: tab.table } : {}),
      });
    }
    view = { ...view, zooms, widths, crashed };
    if (wanted && ids.includes(wanted)) {
      const id = wanted;
      wanted = null;
      activateLocally(id, snapshot.tabs, snapshot.revision);
    } else if (reporting === 0 && snapshot.active && snapshot.active !== view.active && ids.includes(snapshot.active)) {
      // Main showed a tab itself (a launch's file, the settings tab), and has heard every choice made here.
      set({ revision: snapshot.revision, tabs: snapshot.tabs, active: snapshot.active });
    } else if (view.active && ids.includes(view.active)) {
      set({ revision: snapshot.revision, tabs: snapshot.tabs });
    } else if (snapshot.active && ids.includes(snapshot.active)) {
      set({ revision: snapshot.revision, tabs: snapshot.tabs, active: snapshot.active });
    } else {
      // The active tab went away: take the one now in its place, or the last.
      const at = view.active ? view.tabs.findIndex((tab) => tab.id === view.active) : 0;
      const next = snapshot.tabs[Math.min(Math.max(at, 0), snapshot.tabs.length - 1)]?.id ?? null;
      activateLocally(next, snapshot.tabs, snapshot.revision);
    }
  };

  const store: TabStore = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => view,
    async start() {
      unsubscribe = [api.onChanged(apply), api.onDemote(demote), api.onStale(reread)];
      apply(await api.snapshot());
    },
    stop() {
      for (const stop of unsubscribe) stop();
      unsubscribe = [];
      for (const timer of reloadTimers.values()) clearTimeout(timer);
      reloadTimers.clear();
    },
    activate(id) {
      if (id === view.active || !view.tabs.some((tab) => tab.id === id)) return;
      activateLocally(id, view.tabs, view.revision);
    },
    setCloseGuard(next) {
      closeGuard = next;
    },
    close(id) {
      if (closeGuard && view.statuses.get(id)?.dirty) {
        void closeGuard(id).then((agreed) => agreed && closeNow(id));
        return;
      }
      closeNow(id);
    },
    move(id, position) {
      void api.move(id, position);
    },
    moved(id, position) {
      positions.set(id, position);
      void api.position(id, position);
    },
    positionOf: (id) => positions.get(id) ?? null,
    viewStateOf: (id) => viewStates.get(id) ?? {},
    setViewState(id, state) {
      if (JSON.stringify(viewStates.get(id) ?? {}) === JSON.stringify(state)) return;
      viewStates.set(id, state);
      void api.viewState(id, state);
    },
    renderAgain(id, view) {
      if (view) store.setViewState(id, { ...store.viewStateOf(id), view });
      void api.renderAgain(id).catch(ignoreClosedTab);
    },
    reread,
    setStatus(id, status) {
      const current = view.statuses.get(id);
      if (current && JSON.stringify(current) === JSON.stringify(status)) return;
      set({ statuses: new Map(view.statuses).set(id, status) });
    },
    zoom(id, direction) {
      const zooms = new Map(view.zooms);
      const next = zoomStep(zooms.get(id) ?? 1, direction);
      if (next === 1) zooms.delete(id);
      else zooms.set(id, next);
      set({ zooms });
      void api.zoom(id, next);
    },
    width(id, direction, setting) {
      const widths = new Map(view.widths);
      const next = widthStep(widths.get(id) ?? null, setting, direction);
      if (next === null) widths.delete(id);
      else widths.set(id, next);
      set({ widths });
      void api.width(id, next);
    },
    reloaded(id) {
      clearTimeout(reloadTimers.get(id));
      reloadTimers.set(
        id,
        setTimeout(() => {
          reloadTimers.delete(id);
          const reloaded = new Set(view.reloaded);
          reloaded.delete(id);
          set({ reloaded });
        }, RELOADED_MS),
      );
      if (!view.reloaded.has(id)) set({ reloaded: new Set(view.reloaded).add(id) });
    },
    reopenClosed() {
      void api.reopenClosed().then((id) => {
        if (!id) return;
        if (view.tabs.some((tab) => tab.id === id)) store.activate(id);
        else wanted = id;
      });
    },
  };
  return store;
}
