import type { ReadIdentities } from '../../core/documents/identities';
import type { WarmTabs } from '../../core/tabs/lifecycle';
import type { TabRegistry } from '../../core/tabs/registry';
import type { Handlers } from '../ipc/register';

type TabChannels =
  | 'tabs.snapshot'
  | 'tabs.activated'
  | 'tabs.rendered'
  | 'tabs.position'
  | 'tabs.zoom'
  | 'tabs.close'
  | 'tabs.reopenClosed'
  | 'tabs.move';

export interface TabHandlerDeps {
  tabs: TabRegistry;
  warm: WarmTabs;
  reads: ReadIdentities;
  /** Sends the window main's snapshot again. */
  resync: (window: number) => void;
  /** Main drops what it kept for the tab (the text its links are checked against). */
  closed: (id: string) => void;
  /** Tells the window to hibernate these tabs (ADR-002). */
  demote: (window: number, ids: string[]) => void;
  /** Tells the window a tab's file changed since the read it shows. */
  stale: (window: number, id: string) => void;
  /** A tab's position changed (the session keeps it). */
  positioned: (window: number) => void;
  /** The windows of the sender's profile that closed and can come back: when the last one closed, and how. */
  closedWindows: { at: (window: number) => number | null; reopen: (window: number) => void };
}

/**
 * The tab channels, scoped to the sending window. A window naming a tab it doesn't have is out of
 * step with main; it gets main's snapshot again instead of an error (ADR-002).
 */
export function tabHandlers(deps: TabHandlerDeps): Pick<Handlers, TabChannels> {
  const { tabs, warm, reads, resync, closed, demote, stale, positioned, closedWindows } = deps;
  const demoteAll = (window: number, ids: string[]) => {
    if (ids.length > 0) demote(window, ids);
  };
  return {
    'tabs.snapshot': (_args, event) => tabs.snapshot(event.sender.id),
    'tabs.activated': async ([id], event) => {
      const window = event.sender.id;
      if (!tabs.activate(id, window)) return resync(window);
      demoteAll(window, warm.activated(window, id));
      const path = tabs.get(id, window)!.path;
      if (await reads.changed(id, path)) stale(window, id);
    },
    'tabs.rendered': ([id, weight], event) => {
      const window = event.sender.id;
      if (!tabs.get(id, window)) return resync(window);
      demoteAll(window, warm.rendered(window, id, weight));
    },
    'tabs.position': ([id, position], event) => {
      if (tabs.setPosition(id, event.sender.id, position)) positioned(event.sender.id);
      else resync(event.sender.id);
    },
    'tabs.zoom': ([id, zoom], event) => {
      if (!tabs.setZoom(id, event.sender.id, zoom)) resync(event.sender.id);
    },
    'tabs.close': ([id], event) => {
      const window = event.sender.id;
      if (!tabs.close(id, window)) return resync(window);
      warm.forget(window, id);
      reads.forget(id);
      closed(id);
    },
    // Whatever closed last comes back: this window's tab, or a whole window of its profile (UX F4).
    'tabs.reopenClosed': (_args, event) => {
      const window = event.sender.id;
      const tabAt = tabs.closedAt(window);
      const windowAt = closedWindows.at(window);
      if (windowAt !== null && (tabAt === null || windowAt > tabAt)) {
        closedWindows.reopen(window);
        return null;
      }
      return tabs.reopenClosed(window)?.id ?? null;
    },
    'tabs.move': ([id, position], event) => {
      if (!tabs.move(id, event.sender.id, position)) resync(event.sender.id);
    },
  };
}
