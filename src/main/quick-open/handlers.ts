import type { QuickOpen, QuickOpenRequest } from '../../core/quick-open/session';
import type { Handlers } from '../ipc/register';

type QuickOpenChannels = 'quickOpen.start' | 'quickOpen.query' | 'quickOpen.open' | 'quickOpen.close';

/**
 * The quick-open channels, scoped to the sending window. The page opens a file by the id main
 * gave it in the last results, never by path (ADR-004, SR-12).
 */
export function quickOpenHandlers(deps: {
  quickOpen: QuickOpen;
  /** What the window shows and has open, its profile's recent files and exclusions; null for no such window. */
  request: (window: number) => QuickOpenRequest | null;
  /** Shows the file in the window, or in a new window of its profile. */
  open: (window: number, path: string, newWindow: boolean) => Promise<void> | void;
}): Pick<Handlers, QuickOpenChannels> {
  const { quickOpen, request, open } = deps;
  return {
    'quickOpen.start': (_args, event) => {
      const window = event.sender.id;
      return quickOpen.start(window, request(window) ?? { active: null, tabs: [], recent: [], exclude: [] });
    },
    'quickOpen.query': ([token, query], event) => quickOpen.query(event.sender.id, token, query),
    'quickOpen.open': async ([token, id, newWindow], event) => {
      const window = event.sender.id;
      const path = quickOpen.choose(window, token, id);
      if (!path) throw new Error('not offered');
      quickOpen.close(window, token);
      await open(window, path, newWindow);
    },
    'quickOpen.close': ([token], event) => quickOpen.close(event.sender.id, token),
  };
}
