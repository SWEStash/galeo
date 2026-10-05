/** Crashes within this long of each other count towards a crash loop. */
const LOOP_WINDOW_MS = 60_000;
/** The crash that makes this many within the loop window leaves the window down. */
const LOOP_CRASHES = 3;

/**
 * Crash recovery (ADR-002): which tab each window was rendering when its renderer went away (its
 * breadcrumb), and whether to bring the window back. A window that keeps crashing is left down
 * rather than reloaded in a loop.
 */
export class CrashRecovery {
  private readonly breadcrumbs = new Map<number, string>();
  private readonly crashes = new Map<number, number[]>();

  constructor(private readonly now: () => number) {}

  /** The window is about to insert tab `id`'s document. */
  rendering(window: number, id: string): void {
    this.breadcrumbs.set(window, id);
  }

  /** The window finished showing tab `id`. */
  rendered(window: number, id: string): void {
    if (this.breadcrumbs.get(window) === id) this.breadcrumbs.delete(window);
  }

  /** The window's renderer went away: the tab to blame, if any, and whether to bring the window back. */
  crashed(window: number): { tab: string | null; reload: boolean } {
    const tab = this.breadcrumbs.get(window) ?? null;
    this.breadcrumbs.delete(window);
    const now = this.now();
    const recent = [...(this.crashes.get(window) ?? []).filter((at) => now - at < LOOP_WINDOW_MS), now];
    this.crashes.set(window, recent);
    return { tab, reload: recent.length < LOOP_CRASHES };
  }

  closeWindow(window: number): void {
    this.breadcrumbs.delete(window);
    this.crashes.delete(window);
  }
}
