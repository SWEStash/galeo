import type { BrowserWindow, InputEvent, WebContents } from 'electron';
import type { EditGrants } from '../../core/documents/edit-grants';
import type { ReadIdentities } from '../../core/documents/identities';
import type { InputCredits } from '../../core/documents/input-credits';
import type { UnsavedChanges } from '../../core/documents/unsaved';
import type { SessionKeeper } from '../../core/session/keeper';
import type { WindowBounds } from '../../core/session/model';
import type { WarmTabs } from '../../core/tabs/lifecycle';
import type { TabRegistry, WindowState } from '../../core/tabs/registry';
import type { FocusOrder } from './focus-order';

// What a main window does on its own events (ADR-026). Each hook takes the window and only what it
// needs; the window's opener adds them in a fixed order, which is the order its events are handled in.

/** What the hooks need of a window. */
export type HookedWindow = Pick<BrowserWindow, 'on' | 'flashFrame' | 'close' | 'isDestroyed'> & {
  webContents: Pick<WebContents, 'id' | 'on'>;
};

/** Moving or resizing the window changes what its profile's session saves. */
export function followBounds(window: HookedWindow, changed: () => void): void {
  window.on('move', changed);
  window.on('resize', changed);
}

/**
 * A focused window stops asking for attention and comes to the front. A shown file that came back (or
 * changed) is read again (UX: missing recovers); hibernated tabs read when they wake anyway.
 */
export function trackFocus(
  window: HookedWindow,
  deps: {
    order: Pick<FocusOrder, 'front'>;
    /** Its profile was used last, and its session saves the new order. */
    focused: () => void;
    warm: Pick<WarmTabs, 'warm'>;
    tabs: Pick<TabRegistry, 'get'>;
    reads: Pick<ReadIdentities, 'changed'>;
    stale: (id: string) => void;
  },
): void {
  const windowId = window.webContents.id;
  window.on('focus', () => {
    window.flashFrame(false);
    deps.order.front(windowId);
    deps.focused();
    for (const id of deps.warm.warm(windowId)) {
      const tab = deps.tabs.get(id, windowId);
      if (tab) void deps.reads.changed(id, tab.path).then((changed) => changed && deps.stale(id));
    }
  });
}

/**
 * Closing a window with unsaved changes asks the reader first (ADR-013). A closing window of several
 * keeps its tabs to reopen with Ctrl+Shift+T while the profile runs (UX F5); the profile's last one
 * holds the save at what it shows now, not the empty aftermath.
 */
export function guardClose(
  window: HookedWindow,
  deps: {
    quitting: () => boolean;
    profile: {
      readonly discard: boolean;
      readonly windows: readonly unknown[];
      keeper: Pick<SessionKeeper, 'holdForQuit'>;
      keepClosed(closed: { state: WindowState; bounds: WindowBounds; at: number }): void;
    };
    dirty: EditGrants['dirty'];
    confirm: UnsavedChanges['confirm'];
    /** The window is closing because its last tab moved away: the session keeps no empty window. */
    emptiedByMove: (window: number) => boolean;
    tabs: Pick<TabRegistry, 'exportWindow' | 'stamp'>;
    bounds: () => WindowBounds;
  },
): void {
  const { profile, tabs } = deps;
  const windowId = window.webContents.id;
  // The reader already agreed to close it with unsaved changes.
  let agreed = false;
  window.on('close', (event) => {
    if (!deps.quitting() && !profile.discard && !agreed && deps.dirty(windowId).length > 0) {
      event.preventDefault();
      void deps.confirm([windowId]).then((proceed) => {
        if (!proceed || window.isDestroyed()) return;
        agreed = true;
        window.close();
      });
      return;
    }
    if (deps.quitting() || profile.discard) return;
    if (profile.windows.length === 1) return void profile.keeper.holdForQuit(deps.emptiedByMove(windowId) ? { without: windowId } : {});
    const closed = tabs.exportWindow(windowId);
    if (closed.tabs.length > 0) profile.keepClosed({ state: closed, bounds: deps.bounds(), at: tabs.stamp() });
  });
}

const REAL_INPUT = new Set<InputEvent['type']>(['rawKeyDown', 'keyDown', 'mouseDown', 'gestureTap', 'touchStart']);

/** Real input in the window is what lets a request reach beyond its own grants (T6). */
export function countInput(window: HookedWindow, input: Pick<InputCredits, 'received' | 'pressed' | 'released'>): void {
  const windowId = window.webContents.id;
  window.webContents.on('input-event', (_event, event) => {
    if (REAL_INPUT.has(event.type)) input.received(windowId);
    if (event.type === 'mouseDown') input.pressed(windowId);
    else if (event.type === 'mouseUp') input.released(windowId);
  });
}

/** A renderer that went away comes back (ADR-002), unless it exited cleanly or the app is quitting. */
export function recoverOnCrash<W extends HookedWindow>(
  window: W,
  deps: { quitting: () => boolean; recover: (window: W, reason: string) => void },
): void {
  window.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit' || deps.quitting() || window.isDestroyed()) return;
    deps.recover(window, details.reason);
  });
}
