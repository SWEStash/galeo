import type { EditGrants } from '../../core/documents/edit-grants';
import type { ReadIdentities } from '../../core/documents/identities';
import type { CrashRecovery } from '../../core/tabs/crashes';
import type { WarmTabs } from '../../core/tabs/lifecycle';
import type { TabRegistry } from '../../core/tabs/registry';

/** What crash recovery needs of a window. */
interface PageWindow {
  webContents: { id: number; reload(): void };
}

/**
 * A window's renderer going away (ADR-002): the tab it was rendering is marked crashed, so it isn't
 * rendered again until the reader asks, and the page comes back with its tabs from the registry,
 * only the shown one rendered. A window that keeps crashing comes back showing the crash-loop
 * message instead (UX §4), and is left down if even that crashes.
 */
export function windowCrashes(deps: {
  crashes: CrashRecovery;
  tabs: Pick<TabRegistry, 'get' | 'list' | 'snapshot' | 'markCrashed'>;
  warm: Pick<WarmTabs, 'warm' | 'forget' | 'activated'>;
  reads: Pick<ReadIdentities, 'forget'>;
  grants: Pick<EditGrants, 'dropClean'>;
  /**
   * Unpackaged test runs only: kills the window's renderer as it starts rendering the file
   * `crashOn()` names, after the report that triggered it.
   */
  forTests?: { crashOn: () => string | undefined; seen: (path: string) => void; kill: (window: number) => void };
}) {
  const { crashes, tabs, warm, reads, grants, forTests } = deps;
  // Windows a test is crashing: the page goes on until the crash lands, so its later reports are
  // ignored, as a crash in the middle of rendering would never have sent them.
  const crashing = new Set<number>();

  /** The window's page loads again, its tabs hibernated but for the shown one (unless it shows the crash loop). */
  const reload = (window: PageWindow, { activate }: { activate: boolean }) => {
    const windowId = window.webContents.id;
    for (const id of warm.warm(windowId)) warm.forget(windowId, id);
    for (const record of tabs.list(windowId)) reads.forget(record.id);
    // The page comes back read-only; tabs with unsaved text get it back from main, still editable.
    grants.dropClean(windowId);
    const active = tabs.snapshot(windowId).active;
    if (active && activate) warm.activated(windowId, active);
    window.webContents.reload();
  };

  const recover = (window: PageWindow, reason: string) => {
    const windowId = window.webContents.id;
    const { tab, then } = crashes.crashed(windowId);
    crashing.delete(windowId);
    console.warn(`galeo: window ${windowId} renderer gone (${reason})${tab ? ', crashed while rendering a tab' : ''}`);
    if (tab) tabs.markCrashed(tab, windowId);
    if (then === 'stay-down') return console.warn(`galeo: window ${windowId} crashed again on the crash-loop message; left down`);
    if (then === 'give-up') console.warn(`galeo: window ${windowId} crashed repeatedly; showing the crash-loop message`);
    reload(window, { activate: then === 'reload' });
  };

  /** The rendering reports, as the tab channels hear them. */
  const reports: Pick<CrashRecovery, 'rendering' | 'rendered'> = !forTests
    ? crashes
    : {
        rendering: (windowId, id) => {
          crashes.rendering(windowId, id);
          const path = tabs.get(id, windowId)?.path;
          forTests.seen(path ?? id);
          const wanted = forTests.crashOn();
          if (!wanted || path !== wanted) return;
          crashing.add(windowId);
          forTests.kill(windowId);
        },
        rendered: (windowId, id) => {
          if (!crashing.has(windowId)) crashes.rendered(windowId, id);
        },
      };

  return { recover, reload, reports };
}
