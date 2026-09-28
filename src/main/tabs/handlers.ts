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
  positioned: () => void;
}

/**
 * The tab channels, scoped to the sending window. A window naming a tab it doesn't have is out of
 * step with main; it gets main's snapshot again instead of an error (ADR-002).
 */
export function tabHandlers(deps: TabHandlerDeps): Pick<Handlers, TabChannels> {
  const { tabs, warm, reads, resync, closed, demote, stale, positioned } = deps;
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
      if (tabs.setPosition(id, event.sender.id, position)) positioned();
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
    'tabs.reopenClosed': (_args, event) => tabs.reopenClosed(event.sender.id)?.id ?? null,
    'tabs.move': ([id, position], event) => {
      if (!tabs.move(id, event.sender.id, position)) resync(event.sender.id);
    },
  };
}
