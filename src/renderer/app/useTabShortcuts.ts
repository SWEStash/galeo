import { useEffect } from 'react';
import type { Command } from '../../shared/keymap';
import type { ReaderWidth } from '../../shared/tabs';
import { useCommands } from '../commands/useCommands';
import { hasReadingColumn } from '../document/width';
import { tabAction } from '../tabs/commands';
import type { TabStore } from '../tabs/store';
import { wheelZoom } from '../tabs/wheel-zoom';
import { movableTab, moveShownTab } from './tab-moves';

/** The tab shortcuts, per-tab zoom and reader width (UX §5), wherever the focus is. */
export function useTabShortcuts(store: TabStore, openQuickOpen: () => void, measure: ReaderWidth, say: (message: string) => void) {
  // The store's state as of the key, not of the last render: keys can come faster than renders.
  const active = () => store.getSnapshot().active;
  const zoom = (direction: 'in' | 'out' | 'reset') => () => {
    const id = active();
    if (!id) return false;
    store.zoom(id, direction);
    return true;
  };
  const width = (direction: 'wider' | 'narrower' | 'reset' | 'full') => () => {
    const id = active();
    if (!id) return false;
    if (!hasReadingColumn(store.getSnapshot().statuses.get(id))) say('Reader width applies to the rendered view');
    else store.width(id, direction, measure);
    return true;
  };
  const tabs = (command: Command) => ({ tabNumber }: { tabNumber: number | null }) => {
    const action = tabAction(command, tabNumber, store.getSnapshot());
    if (!action) return false;
    if (action.kind === 'activate') store.activate(action.id);
    else if (action.kind === 'move') store.move(action.id, action.position);
    else if (action.kind === 'close') store.close(action.id);
    else store.reopenClosed();
    return true;
  };
  // Ctrl and the wheel zoom too, unless something under the pointer took the wheel (the viewer).
  useEffect(() => {
    let pending = 0;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || event.defaultPrevented) return;
      event.preventDefault();
      const turned = wheelZoom(pending, event);
      pending = turned.pending;
      if (turned.step) zoom(turned.step)();
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [store]);
  useCommands({
    zoomIn: zoom('in'),
    zoomOut: zoom('out'),
    zoomReset: zoom('reset'),
    widenReader: width('wider'),
    narrowReader: width('narrower'),
    resetReaderWidth: width('reset'),
    fullWidth: width('full'),
    quickOpen: openQuickOpen,
    reload: () => {
      const id = active();
      if (!id) return false;
      store.reread(id);
      return true;
    },
    settings: () => void window.galeo.tabs.openSettings(),
    nextTab: tabs('nextTab'),
    previousTab: tabs('previousTab'),
    goToTab: tabs('goToTab'),
    goToLastTab: tabs('goToLastTab'),
    moveTabLeft: tabs('moveTabLeft'),
    moveTabRight: tabs('moveTabRight'),
    moveTabToNewWindow: () => {
      const id = movableTab(store, say);
      if (id === undefined) return false;
      if (id === null) return true;
      if (store.getSnapshot().tabs.length < 2) say("It's this window's only tab");
      else moveShownTab(id, 'new', say);
      return true;
    },
    closeTab: tabs('closeTab'),
    reopenClosed: tabs('reopenClosed'),
  });
}
