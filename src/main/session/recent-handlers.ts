import type { SelectionGrants } from '../../core/documents/selections';
import type { RecentFiles } from '../../core/session/recent';
import type { TabRegistry } from '../../core/tabs/registry';
import type { Handlers } from '../ipc/register';

/** The empty window shows this many recent files (UX §4). */
const SHOWN = 8;

/**
 * The profile's recent files for the empty window. The page gets opaque ids for the files main
 * offered it, and opens one by id only; main opens the path it offered (ADR-004).
 */
export function recentHandlers(deps: {
  recent: RecentFiles;
  selections: SelectionGrants;
  tabs: TabRegistry;
}): Pick<Handlers, 'recent.list' | 'recent.open' | 'recent.clear'> {
  const { recent, selections, tabs } = deps;
  return {
    'recent.list': (_args, event) =>
      selections.offer(event.sender.id, 'recent', recent.list().slice(0, SHOWN).map((file) => file.path)),
    'recent.open': ([id], event) => {
      const path = selections.choose(event.sender.id, 'recent', id);
      if (!path) throw new Error('not offered');
      tabs.open(path, event.sender.id);
    },
    'recent.clear': () => {
      selections.withdraw('recent');
      return recent.clear();
    },
  };
}
