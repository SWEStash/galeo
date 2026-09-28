import type { GaleoApi } from '../../shared/contracts';
import type { DocumentRecord } from '../../shared/documents';
import type { TabSnapshot } from '../../shared/tabs';

export interface TabsView {
  revision: number;
  tabs: DocumentRecord[];
  /** The tab this window shows; the window decides it and tells main (ADR-002). */
  active: string | null;
}

export type TabsApi = Pick<GaleoApi['tabs'], 'snapshot' | 'activated' | 'close' | 'onChanged'>;

export interface TabStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): TabsView;
  /** Pulls main's tabs and follows its snapshots from then on. */
  start(): Promise<void>;
  activate(id: string): void;
  close(id: string): void;
}

/**
 * This window's mirror of main's tab registry, for `useSyncExternalStore` (ADR-006). Main owns which
 * tabs exist and their order; a snapshot replaces the mirror only if its revision is newer. Which
 * tab is active is decided here, at once, and reported afterwards.
 */
export function createTabStore(api: TabsApi): TabStore {
  let view: TabsView = { revision: -1, tabs: [], active: null };
  const listeners = new Set<() => void>();

  const set = (next: TabsView) => {
    view = next;
    for (const listener of listeners) listener();
  };

  const activateLocally = (active: string | null, tabs: DocumentRecord[], revision: number) => {
    set({ revision, tabs, active });
    if (active) void api.activated(active);
  };

  const apply = (snapshot: TabSnapshot) => {
    if (snapshot.revision <= view.revision) return;
    const ids = snapshot.tabs.map((tab) => tab.id);
    if (view.active && ids.includes(view.active)) {
      set({ revision: snapshot.revision, tabs: snapshot.tabs, active: view.active });
    } else if (snapshot.active && ids.includes(snapshot.active)) {
      set({ revision: snapshot.revision, tabs: snapshot.tabs, active: snapshot.active });
    } else {
      // The active tab went away: take the one now in its place, or the last.
      const at = view.active ? view.tabs.findIndex((tab) => tab.id === view.active) : 0;
      const next = snapshot.tabs[Math.min(Math.max(at, 0), snapshot.tabs.length - 1)]?.id ?? null;
      activateLocally(next, snapshot.tabs, snapshot.revision);
    }
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => view,
    async start() {
      api.onChanged(apply);
      apply(await api.snapshot());
    },
    activate(id) {
      if (id === view.active || !view.tabs.some((tab) => tab.id === id)) return;
      activateLocally(id, view.tabs, view.revision);
    },
    close(id) {
      const index = view.tabs.findIndex((tab) => tab.id === id);
      if (index < 0) return;
      if (id === view.active) {
        const next = view.tabs[index + 1] ?? view.tabs[index - 1];
        activateLocally(next?.id ?? null, view.tabs, view.revision);
      }
      void api.close(id);
    },
  };
}
