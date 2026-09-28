import { useEffect, useState, useSyncExternalStore } from 'react';
import { createTabStore, type TabStore, type TabsView } from './store';

/** This window's tabs, mirrored from main. */
export function useTabs(): { view: TabsView; store: TabStore } {
  const [store] = useState(() => createTabStore(window.galeo.tabs));
  useEffect(() => {
    void store.start();
  }, [store]);
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { view, store };
}
