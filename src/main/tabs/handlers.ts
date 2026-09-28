import type { TabRegistry } from '../../core/tabs/registry';
import type { Handlers } from '../ipc/register';

type TabChannels = 'tabs.snapshot' | 'tabs.activated' | 'tabs.close' | 'tabs.reopenClosed' | 'tabs.move';

/**
 * The tab channels, scoped to the sending window. A window naming a tab it doesn't have is out of
 * step with main; it gets main's snapshot again instead of an error (ADR-002).
 */
export function tabHandlers(deps: {
  tabs: TabRegistry;
  resync: (window: number) => void;
  /** Main drops what it kept for the tab (the text its links are checked against). */
  closed: (id: string) => void;
}): Pick<Handlers, TabChannels> {
  const { tabs, resync, closed } = deps;
  const orResync = (done: boolean, window: number) => {
    if (!done) resync(window);
  };
  return {
    'tabs.snapshot': (_args, event) => tabs.snapshot(event.sender.id),
    'tabs.activated': ([id], event) => orResync(tabs.activate(id, event.sender.id), event.sender.id),
    'tabs.close': ([id], event) => {
      if (tabs.close(id, event.sender.id)) closed(id);
      else resync(event.sender.id);
    },
    'tabs.reopenClosed': (_args, event) => void tabs.reopenClosed(event.sender.id),
    'tabs.move': ([id, position], event) => orResync(tabs.move(id, event.sender.id, position), event.sender.id),
  };
}
