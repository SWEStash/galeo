/** Crashes within this long of each other count towards a crash loop. */
const LOOP_WINDOW_MS = 60_000;
/** The crash that makes this many within the loop window gives up on the window. */
const LOOP_CRASHES = 3;

/**
 * After a crash: bring the window back with its tabs (`reload`), show it the crash-loop message
 * instead of its tabs (`give-up`), or leave it down: the message's own page crashed (`stay-down`).
 */
type AfterCrash = 'reload' | 'give-up' | 'stay-down';

/**
 * Crash recovery (ADR-002): which tab each window was rendering when its renderer went away (its
 * breadcrumb), and what to do with the window. One that keeps crashing is not reloaded in a loop:
 * it says so, and the reader can try again or close it (UX §4).
 */
export class CrashRecovery {
  private readonly breadcrumbs = new Map<number, string>();
  private readonly crashes = new Map<number, number[]>();
  private readonly givenUp = new Set<number>();

  constructor(private readonly now: () => number) {}

  /** The window is about to insert tab `id`'s document. */
  rendering(window: number, id: string): void {
    this.breadcrumbs.set(window, id);
  }

  /** The window finished showing tab `id`. */
  rendered(window: number, id: string): void {
    if (this.breadcrumbs.get(window) === id) this.breadcrumbs.delete(window);
  }

  /** The window's renderer went away: the tab to blame, if any, and what to do with the window. */
  crashed(window: number): { tab: string | null; then: AfterCrash } {
    const tab = this.breadcrumbs.get(window) ?? null;
    this.breadcrumbs.delete(window);
    if (this.givenUp.has(window)) return { tab, then: 'stay-down' };
    const now = this.now();
    const recent = [...(this.crashes.get(window) ?? []).filter((at) => now - at < LOOP_WINDOW_MS), now];
    this.crashes.set(window, recent);
    if (recent.length < LOOP_CRASHES) return { tab, then: 'reload' };
    this.givenUp.add(window);
    return { tab, then: 'give-up' };
  }

  /** Whether the window shows the crash-loop message rather than its tabs. */
  gaveUp(window: number): boolean {
    return this.givenUp.has(window);
  }

  /** The reader asked to try a given-up window again: a fresh count. False if it wasn't given up. */
  retry(window: number): boolean {
    if (!this.givenUp.delete(window)) return false;
    this.crashes.delete(window);
    return true;
  }

  closeWindow(window: number): void {
    this.breadcrumbs.delete(window);
    this.crashes.delete(window);
    this.givenUp.delete(window);
  }
}
