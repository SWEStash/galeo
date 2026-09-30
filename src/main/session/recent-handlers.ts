import type { SelectionGrants } from '../../core/documents/selections';
import type { RecentFiles } from '../../core/session/recent';
import type { Handlers } from '../ipc/register';

/** The empty window shows this many recent files (UX §4). */
const SHOWN = 8;

/**
 * The profile's recent files for the empty window. The page gets opaque ids for the files main
 * offered it, and opens one by id only; main opens the path it offered (ADR-004).
 */
export function recentHandlers(deps: {
  /** The recent files of the window's profile. */
  recent: (window: number) => RecentFiles | undefined;
  selections: SelectionGrants;
  /** Shows the file in the window: its tab if it has one, else a new one. */
  open: (window: number, path: string) => void;
}): Pick<Handlers, 'recent.list' | 'recent.open' | 'recent.clear'> {
  const { recent, selections, open } = deps;
  return {
    'recent.list': (_args, event) =>
      selections.offer(event.sender.id, 'recent', (recent(event.sender.id)?.list() ?? []).slice(0, SHOWN).map((file) => file.path)),
    'recent.open': ([id], event) => {
      const path = selections.choose(event.sender.id, 'recent', id);
      if (!path) throw new Error('not offered');
      open(event.sender.id, path);
    },
    'recent.clear': async (_args, event) => {
      const list = recent(event.sender.id);
      if (!list) return;
      selections.withdraw('recent');
      await list.clear();
    },
  };
}
