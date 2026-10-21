import type { TabHit, TabSearchResults } from '../../shared/tabs';
import { fileName, folderOf, shownPath } from '../../shared/paths';
import { matchPath } from '../quick-open/matcher';

interface Tab {
  id: string;
  path: string;
}

/**
 * Tab search (UX F16): the window's open tabs and its closed ones, matched by the path as the
 * reader sees it (`~/…`), as quick open matches. An empty query lists them all as given: open tabs
 * in tab order, closed ones newest first.
 */
export function searchTabs(query: string, open: readonly Tab[], closed: readonly Tab[], home: string): TabSearchResults {
  const hits = (tabs: readonly Tab[]): TabHit[] =>
    tabs
      .map((tab, order) => ({ tab, order, match: matchPath(query, shownPath(tab.path, home)) }))
      .filter((each) => each.match !== null)
      .sort((a, b) => b.match!.score - a.match!.score || a.order - b.order)
      .map(({ tab }) => ({ id: tab.id, name: fileName(tab.path), detail: shownPath(folderOf(tab.path), home) }));
  return { query, open: hits(open), closed: hits(closed) };
}
