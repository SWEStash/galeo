import { folderOf, shownPath } from '../../shared/paths';
import type { TabSnapshot } from '../../shared/tabs';
import { detectFormat } from '../formats/registry';

/**
 * A snapshot as the page gets it: each file tab also carries its format and its folder as the
 * reader sees it (`~/…`), for the tab overview (UX F17). Sessions keep the registry's own snapshot.
 */
export function forPage(snapshot: TabSnapshot, home: string): TabSnapshot {
  return {
    ...snapshot,
    tabs: snapshot.tabs.map((tab) => (tab.kind === 'settings' ? tab : { ...tab, format: detectFormat(tab.path), folder: shownPath(folderOf(tab.path), home) })),
  };
}
