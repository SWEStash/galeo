import type { InputCredits } from '../../core/documents/input-credits';
import type { QuickOpen, QuickOpenRequest } from '../../core/quick-open/session';
import type { Handlers } from '../ipc/register';

type QuickOpenChannels = 'quickOpen.start' | 'quickOpen.query' | 'quickOpen.open' | 'quickOpen.close';

/**
 * The quick-open channels, scoped to the sending window. The page opens a file by the id main
 * gave it in the last results, never by path (ADR-004, SR-12). Listing a typed folder and opening
 * a file each spend a credit of real input, so a compromised page can't do either on its own (T6).
 */
export function quickOpenHandlers(deps: {
  quickOpen: QuickOpen;
  input: Pick<InputCredits, 'spend'>;
  /** What the window shows and has open, its profile's recent files and exclusions; null for no such window. */
  request: (window: number) => QuickOpenRequest | null;
  /** Shows the file in the window, or in a new window of its profile. */
  open: (window: number, path: string, newWindow: boolean) => Promise<void> | void;
}): Pick<Handlers, QuickOpenChannels> {
  const { quickOpen, input, request, open } = deps;
  return {
    'quickOpen.start': (_args, event) => {
      const window = event.sender.id;
      return quickOpen.start(window, request(window) ?? { active: null, tabs: [], recent: [], exclude: [] });
    },
    'quickOpen.query': ([token, query], event) => quickOpen.query(event.sender.id, token, query, () => input.spend(event.sender.id)),
    'quickOpen.open': async ([token, id, newWindow], event) => {
      const window = event.sender.id;
      if (!input.spend(window)) throw new Error('no input');
      const path = quickOpen.choose(window, token, id);
      if (!path) throw new Error('not offered');
      quickOpen.close(window, token);
      await open(window, path, newWindow);
    },
    'quickOpen.close': ([token], event) => quickOpen.close(event.sender.id, token),
  };
}
