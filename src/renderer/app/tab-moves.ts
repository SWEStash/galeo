import { editors } from '../edit/editors';
import { unlessClosed } from '../tabs/closed-tab';
import { shownTab, type TabStore } from '../tabs/store';

/**
 * The shown tab, if it can move to another window: the settings tab stays (UX F15). Undefined when
 * no tab is shown; null, said why, for the settings tab.
 */
export function movableTab(store: TabStore, say: (message: string) => void): string | null | undefined {
  const shown = shownTab(store.getSnapshot());
  if (!shown) return undefined;
  if (shown.kind !== 'settings') return shown.id;
  say('The Settings tab stays in its window');
  return null;
}

/** Moves the tab to another window or a new one (ADR-019), its unsaved text handed to main first. */
export function moveShownTab(id: string, target: number | 'new', say: (message: string) => void) {
  editors.get(id)?.keepNow();
  void window.galeo.tabs.moveTo(id, target).then((moved) => {
    if (!moved) say("The tab didn't move");
  }, unlessClosed(say, "The tab didn't move"));
}
