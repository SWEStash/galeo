import type { EditGrants } from '../../core/documents/edit-grants';
import type { CrashRecovery } from '../../core/tabs/crashes';
import type { WarmTabs } from '../../core/tabs/lifecycle';
import type { TabRegistry } from '../../core/tabs/registry';

export interface TabMoverDeps {
  tabs: TabRegistry;
  grants: Pick<EditGrants, 'transfer'>;
  warm: Pick<WarmTabs, 'forget' | 'activated'>;
  crashes: Pick<CrashRecovery, 'rendered'>;
  /** Tells the window to hibernate these tabs (ADR-002). */
  demote: (window: number, ids: string[]) => void;
  /** The window's last tab left: it closes. */
  emptied: (window: number) => void;
}

/**
 * Moves a tab, under its id, to another window (ADR-019): drag, tear-off and the palette all come
 * here. The grant goes first, as the registry's change makes the window the tab left drop every
 * grant it no longer shows, unsaved text included.
 */
export function tabMover(deps: TabMoverDeps): (id: string, from: number, to: number, position: number) => boolean {
  const { tabs, grants, warm, crashes, demote, emptied } = deps;
  return (id, from, to, position) => {
    const tab = tabs.get(id, from);
    if (!tab || tab.kind === 'settings' || from === to) return false;
    grants.transfer(id, from, to);
    tabs.transfer(id, from, to, position);
    warm.forget(from, id);
    const pushedOut = warm.activated(to, id);
    if (pushedOut.length > 0) demote(to, pushedOut);
    // Not the window's tab any more: a later crash there must not blame it.
    crashes.rendered(from, id);
    if (tabs.list(from).length === 0) emptied(from);
    return true;
  };
}
