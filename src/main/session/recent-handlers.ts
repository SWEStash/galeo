import type { InputCredits } from '../../core/documents/input-credits';
import type { SelectionGrants } from '../../core/documents/selections';
import type { RecentFiles } from '../../core/session/recent';
import type { Handlers } from '../ipc/register';

/** The empty window shows this many recent files (UX §4). */
const SHOWN = 8;

/**
 * The profile's recent files for the empty window. The page gets opaque ids for the files main
 * offered it, and opens one by id only; main opens the path it offered (ADR-004). Clearing the
 * list spends a credit of real input, so a compromised page can't do it on its own (T6).
 */
export function recentHandlers(deps: {
  /** The recent files of the window's profile. */
  recent: (window: number) => RecentFiles | undefined;
  input: Pick<InputCredits, 'spend'>;
  selections: SelectionGrants;
  /** Shows the file in the window: its tab if it has one, else a new one. */
  open: (window: number, path: string) => Promise<void>;
}): Pick<Handlers, 'recent.list' | 'recent.open' | 'recent.clear'> {
  const { recent, input, selections, open } = deps;
  return {
    'recent.list': (_args, event) =>
      selections.offer(event.sender.id, 'recent', (recent(event.sender.id)?.list() ?? []).slice(0, SHOWN).map((file) => file.path)),
    'recent.open': async ([id], event) => {
      const path = selections.choose(event.sender.id, 'recent', id);
      if (!path) throw new Error('not offered');
      await open(event.sender.id, path);
    },
    'recent.clear': async (_args, event) => {
      if (!input.spend(event.sender.id)) throw new Error('no input');
      const list = recent(event.sender.id);
      if (!list) return;
      selections.withdraw('recent');
      await list.clear();
    },
  };
}
