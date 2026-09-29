import type { GaleoApi } from '../../shared/contracts';
import type { DocumentContent, DocumentRecord, TextEncoding } from '../../shared/documents';
import type { FormatId, ViewMode } from '../../shared/formats';
import { zoomStep } from '../document/zoom';
import type { ScrollAnchor, TabSnapshot } from '../../shared/tabs';

/** What the tab bar and status bar show about a tab, as its document reports it. */
export interface TabStatus {
  state: DocumentContent['state'];
  format: FormatId | null;
  view: ViewMode | null;
  encoding: TextEncoding | null;
  lines: number | null;
  /** A log following its end. */
  follow: boolean;
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
}

export type TabsApi = Pick<
  GaleoApi['tabs'],
  'snapshot' | 'activated' | 'close' | 'move' | 'reopenClosed' | 'position' | 'zoom' | 'onChanged' | 'onDemote' | 'onStale'
>;

export interface TabStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): TabsView;
  /** Pulls main's tabs and follows its snapshots from then on. */
  start(): Promise<void>;
  stop(): void;
  activate(id: string): void;
  close(id: string): void;
  /** Main owns the order: the new order shows once its snapshot arrives. */
  move(id: string, position: number): void;
  reopenClosed(): void;
  /** The reader scrolled a tab: kept here for its next wake, and reported to main for history and sessions. */
  moved(id: string, position: ScrollAnchor): void;
  positionOf(id: string): ScrollAnchor | null;
  setStatus(id: string, status: TabStatus): void;
  /** Reads the tab again, keeping its place (a changed file, or another encoding). */
  reread(id: string): void;
  zoom(id: string, direction: 'in' | 'out' | 'reset'): void;
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
  };
  const positions = new Map<string, ScrollAnchor>();
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
    view = { ...merged, rendered, reads: own(merged.reads), statuses: own(merged.statuses), zooms: own(merged.zooms) };
    for (const id of positions.keys()) if (!ids.has(id)) positions.delete(id);
    for (const listener of listeners) listener();
  };

  const activateLocally = (active: string | null, tabs: DocumentRecord[], revision: number) => {
    set({ revision, tabs, active });
    if (!active) return;
    reporting++;
    void api.activated(active).finally(() => reporting--);
  };

  const demote = (ids: string[]) => {
    const rendered = new Set(view.rendered);
    for (const id of ids) if (id !== view.active) rendered.delete(id);
    set({ rendered });
  };

  const reread = (id: string) => {
    if (!view.tabs.some((tab) => tab.id === id)) return;
    set({ reads: new Map(view.reads).set(id, (view.reads.get(id) ?? 0) + 1) });
  };

  const apply = (snapshot: TabSnapshot) => {
    if (snapshot.revision <= view.revision) return;
    const ids = snapshot.tabs.map((tab) => tab.id);
    // Main holds each tab's zoom, and the last position it heard of: what a restored tab starts from.
    const zooms = new Map(snapshot.tabs.flatMap((tab) => (tab.zoom ? [[tab.id, tab.zoom] as const] : [])));
    for (const tab of snapshot.tabs) if (tab.position && !positions.has(tab.id)) positions.set(tab.id, tab.position);
    view = { ...view, zooms };
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
    },
    activate(id) {
      if (id === view.active || !view.tabs.some((tab) => tab.id === id)) return;
      activateLocally(id, view.tabs, view.revision);
    },
    close(id) {
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
    },
    move(id, position) {
      void api.move(id, position);
    },
    moved(id, position) {
      positions.set(id, position);
      void api.position(id, position);
    },
    positionOf: (id) => positions.get(id) ?? null,
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
