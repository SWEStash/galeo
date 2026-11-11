import type { InputCredits } from '../../core/documents/input-credits';
import type { FolderWatches } from '../../core/watch/watches';
import type { Handlers } from '../ipc/register';

type WatchChannels = 'watch.choose' | 'watch.stop' | 'watch.open' | 'watch.openAllNew' | 'watch.state' | 'watch.panel';

/** More new entries than this, and *Open all new* asks first. */
const OPEN_ALL_ASK_OVER = 20;

/**
 * The watched folder channels, scoped to the sending window (ADR-034). Only main's folder dialog
 * grants a folder, and the page opens entries by the ids main offered, never by path (SR-12).
 * Asking for the dialog and opening each spend a credit of real input, so a page can't do either
 * on its own (T6); stopping and the panel's state need none. *Open all new* asks main's own question
 * before opening more than 20 tabs on one click.
 */
export function watchHandlers(deps: {
  watches: FolderWatches;
  input: Pick<InputCredits, 'spend'>;
  /** Main's folder dialog for the window; null when cancelled. */
  askFolder: (window: number) => Promise<string | null>;
  /** Main's question: open `count` files at once? */
  confirmMany: (window: number, count: number) => Promise<boolean>;
  /** Shows the files in the window, or in a new window of its profile. */
  open: (window: number, paths: readonly string[], newWindow: boolean) => Promise<void> | void;
}): Pick<Handlers, WatchChannels> {
  const { watches, input, askFolder, confirmMany, open } = deps;
  const spend = (window: number) => {
    if (!input.spend(window)) throw new Error('no input');
  };
  return {
    'watch.choose': async (_args, event) => {
      const window = event.sender.id;
      spend(window);
      const folder = await askFolder(window);
      if (folder !== null) await watches.start(window, folder);
    },
    'watch.stop': (_args, event) => watches.stop(event.sender.id),
    'watch.open': async ([id, newWindow], event) => {
      const window = event.sender.id;
      spend(window);
      const path = await watches.choose(window, id);
      if (!path) throw new Error('not offered');
      await open(window, [path], newWindow);
    },
    'watch.openAllNew': async (_args, event) => {
      const window = event.sender.id;
      spend(window);
      const paths = await watches.unopened(window);
      if (paths.length === 0) return;
      if (paths.length > OPEN_ALL_ASK_OVER && !(await confirmMany(window, paths.length))) return;
      await open(window, paths, false);
    },
    'watch.state': (_args, event) => watches.state(event.sender.id),
    'watch.panel': ([open], event) => watches.setPanel(event.sender.id, open),
  };
}
