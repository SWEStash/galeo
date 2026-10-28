import type { ReadIdentities } from '../../core/documents/identities';
import type { InputCredits } from '../../core/documents/input-credits';
import type { CrashRecovery } from '../../core/tabs/crashes';
import { SETTLE_MS, type TabDrags } from '../../core/tabs/drags';
import type { WarmTabs } from '../../core/tabs/lifecycle';
import { forPage } from '../../core/tabs/page';
import type { TabRegistry } from '../../core/tabs/registry';
import { searchTabs } from '../../core/tabs/search';
import type { OtherWindow } from '../../shared/contracts/ipc';
import type { Handlers } from '../ipc/register';

type TabChannels =
  | 'tabs.snapshot'
  | 'tabs.activated'
  | 'tabs.rendering'
  | 'tabs.rendered'
  | 'tabs.renderAgain'
  | 'tabs.position'
  | 'tabs.zoom'
  | 'tabs.width'
  | 'tabs.viewState'
  | 'tabs.close'
  | 'tabs.reopenClosed'
  | 'tabs.search'
  | 'tabs.reopenClosedTab'
  | 'tabs.move'
  | 'tabs.dragStart'
  | 'tabs.dragEnd'
  | 'tabs.adopt'
  | 'tabs.moveTo'
  | 'tabs.windows'
  | 'tabs.openSettings';

interface TabHandlerDeps {
  tabs: TabRegistry;
  warm: WarmTabs;
  reads: ReadIdentities;
  /** Which tab each window is rendering, for crash recovery (ADR-002). */
  crashes: Pick<CrashRecovery, 'rendering' | 'rendered'>;
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
  /** The tab being dragged, if any (ADR-019). */
  drags: TabDrags;
  now: () => number;
  /** Real input per window: starting a drag, listing the windows or a palette move spends one; a drag can spend a held press instead. */
  input: Pick<InputCredits, 'spend' | 'spendPress'>;
  /** Moves a tab to another window, at `position`: false when main refused. */
  move: (id: string, from: number, to: number, position: number) => boolean;
  /** Moves a tab to a new window of its profile. */
  tearOff: (id: string, from: number) => boolean;
  /** The galeo windows other than this one. */
  windows: (window: number) => Promise<OtherWindow[]>;
  focus: (window: number) => void;
  /** Tells every window a tab drag started or ended. */
  dragging: (on: boolean) => void;
  /** Tells one window a tab drag is going on: it opened after the drag started. */
  tellDragging: (window: number) => void;
  /** Runs `run` once `ms` have passed. */
  after: (ms: number, run: () => void) => void;
  /** The home folder: tab search and the tab overview show folders under it as `~/…`. */
  home: string;
}

/**
 * The tab channels, scoped to the sending window. A window naming a tab it doesn't have is out of
 * step with main; it gets main's snapshot again instead of an error (ADR-002).
 */
export function tabHandlers(deps: TabHandlerDeps): Pick<Handlers, TabChannels> {
  const { tabs, warm, reads, crashes, resync, closed, demote, stale, positioned, closedWindows, drags, now, input } = deps;
  /** A tab of the window that can move: not the settings tab. */
  const movable = (id: string, window: number) => {
    const tab = tabs.get(id, window);
    return tab !== undefined && tab.kind !== 'settings';
  };
  /** A tab leaves for a window of its own only when the window keeps another one. */
  const tearOff = (id: string, window: number) => tabs.list(window).length > 1 && deps.tearOff(id, window);
  const demoteAll = (window: number, ids: string[]) => {
    if (ids.length > 0) demote(window, ids);
  };
  return {
    // A page asks for its tabs first thing, listening already: one that opened during a drag hears of it too.
    'tabs.snapshot': (_args, event) => {
      if (drags.dragging(now())) deps.tellDragging(event.sender.id);
      return forPage(tabs.snapshot(event.sender.id), deps.home);
    },
    'tabs.activated': async ([id], event) => {
      const window = event.sender.id;
      if (!tabs.activate(id, window)) return resync(window);
      demoteAll(window, warm.activated(window, id));
      const path = tabs.get(id, window)!.path;
      if (await reads.changed(id, path)) stale(window, id);
    },
    'tabs.rendering': ([id], event) => {
      const window = event.sender.id;
      if (!tabs.get(id, window)) return resync(window);
      crashes.rendering(window, id);
    },
    'tabs.rendered': ([id, weight], event) => {
      const window = event.sender.id;
      if (!tabs.get(id, window)) return resync(window);
      crashes.rendered(window, id);
      demoteAll(window, warm.rendered(window, id, weight));
    },
    'tabs.renderAgain': ([id], event) => {
      if (!tabs.clearCrashed(id, event.sender.id)) resync(event.sender.id);
    },
    'tabs.position': ([id, position], event) => {
      if (tabs.setPosition(id, event.sender.id, position)) positioned(event.sender.id);
      else resync(event.sender.id);
    },
    'tabs.viewState': ([id, state], event) => {
      if (tabs.setViewState(id, event.sender.id, state)) positioned(event.sender.id);
      else resync(event.sender.id);
    },
    'tabs.zoom': ([id, zoom], event) => {
      if (!tabs.setZoom(id, event.sender.id, zoom)) resync(event.sender.id);
    },
    'tabs.width': ([id, width], event) => {
      if (!tabs.setWidth(id, event.sender.id, width)) resync(event.sender.id);
    },
    'tabs.close': ([id], event) => {
      const window = event.sender.id;
      if (!tabs.close(id, window)) return resync(window);
      warm.forget(window, id);
      reads.forget(id);
      closed(id);
    },
    // Whatever closed last comes back: this window's tab, or a whole window of its profile (UX F4), on real input.
    'tabs.reopenClosed': (_args, event) => {
      const window = event.sender.id;
      if (!input.spend(window)) return null;
      const tabAt = tabs.closedAt(window);
      const windowAt = closedWindows.at(window);
      if (windowAt !== null && (tabAt === null || windowAt > tabAt)) {
        closedWindows.reopen(window);
        return null;
      }
      return tabs.reopenClosed(window)?.id ?? null;
    },
    // Only the sender's own tabs: open ones (not the settings tab) and those it closed (UX F16).
    'tabs.search': ([query], event) => {
      const window = event.sender.id;
      const open = tabs.list(window).filter((tab) => tab.kind !== 'settings');
      return searchTabs(query, open, tabs.closedList(window), deps.home);
    },
    'tabs.reopenClosedTab': ([id], event) => {
      const window = event.sender.id;
      if (!tabs.closedList(window).some((tab) => tab.id === id) || !input.spend(window)) return null;
      return tabs.reopenClosedById(window, id)?.id ?? null;
    },
    'tabs.move': ([id, position], event) => {
      if (!tabs.move(id, event.sender.id, position)) resync(event.sender.id);
    },
    // The page's token for this drag is what a drop claims it by (ADR-022).
    'tabs.dragStart': ([id, token], event) => {
      const window = event.sender.id;
      // The press that started the drag, however long the reader held it before moving.
      if (!movable(id, window) || !(input.spendPress(window) || input.spend(window))) return false;
      if (!drags.start(id, token, window, now())) return false;
      deps.dragging(true);
      return true;
    },
    // The window the tab was dropped on may ask for it after this: the drag ends a moment later, if
    // no window took it, and a tab dropped outside the window gets a window of its own (ADR-019).
    'tabs.dragEnd': ([id, outside], event) => {
      const window = event.sender.id;
      const drag = drags.pending(id, window);
      if (!drag) return;
      deps.after(SETTLE_MS, () => {
        if (!drags.settle(drag)) return;
        deps.dragging(false);
        if (outside && movable(id, window)) tearOff(id, window);
      });
    },
    'tabs.adopt': ([token, position], event) => {
      const to = event.sender.id;
      const drag = drags.claim(token, now());
      if (!drag) return null;
      deps.dragging(false);
      return drag.window !== to && deps.move(drag.id, drag.window, to, position) ? drag.id : null;
    },
    'tabs.moveTo': async ([id, target], event) => {
      const window = event.sender.id;
      if (!movable(id, window)) return false;
      if (target === 'new') return tabs.list(window).length > 1 && input.spend(window) && deps.tearOff(id, window);
      const others = await deps.windows(window);
      if (!movable(id, window) || !others.some((other) => other.window === target) || !input.spend(window)) return false;
      if (!deps.move(id, window, target, tabs.list(target).length)) return false;
      deps.focus(target);
      return true;
    },
    'tabs.windows': async (_args, event) => (input.spend(event.sender.id) ? deps.windows(event.sender.id) : []),
    'tabs.openSettings': (_args, event) => tabs.openSettings(event.sender.id).id,
  };
}
