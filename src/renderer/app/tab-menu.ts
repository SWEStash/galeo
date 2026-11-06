import type { TabMenuChoice } from '../../shared/contracts/ipc';
import { unlessClosed } from '../tabs/closed-tab';
import type { TabStore } from '../tabs/store';
import { moveShownTab } from './tab-moves';

interface TabMenuDeps {
  store: TabStore;
  say: (message: string) => void;
  /** Opens Move to window… for the shown tab. */
  chooseWindow: () => void;
}

/**
 * A tab's right-click menu (UX F4): main shows it, copies and reveals; the page runs the rest on that
 * tab as their shortcuts do. Move to window… asks about the shown tab, so the tab is shown first.
 */
export function showTabMenu(id: string, { store, say, chooseWindow }: TabMenuDeps): Promise<void> {
  return window.galeo.tabs.menu(id).then((choice) => runTabMenuChoice(choice, id, { store, say, chooseWindow }), unlessClosed(say, "The tab's menu couldn't open"));
}

export function runTabMenuChoice(choice: TabMenuChoice | null, id: string, { store, say, chooseWindow }: TabMenuDeps): void {
  const tab = store.getSnapshot().tabs.find((each) => each.id === id);
  if (!choice || !tab) return;
  if (choice === 'close') store.close(id);
  else if (choice === 'reopen') store.reopenClosed();
  else if (choice === 'pin') store.pin(id, !tab.pinned);
  else if (choice === 'move-new') moveShownTab(id, 'new', say);
  else {
    store.activate(id);
    chooseWindow();
  }
}
