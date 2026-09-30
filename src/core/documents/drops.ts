/** How many drops a window holds before the oldest is dropped (a drop is used at once). */
const KEPT = 4;

/**
 * Files dropped on a window (SR-12). Only the preload creates a grant, from a real drop's `File`
 * objects; the page learns just an opaque token, and main opens the files once, in that window.
 */
export class DropGrants {
  private readonly drops = new Map<number, Map<string, readonly string[]>>();

  constructor(private readonly randomId: () => string) {}

  grant(window: number, paths: readonly string[]): string {
    const drops = this.drops.get(window) ?? new Map<string, readonly string[]>();
    this.drops.set(window, drops);
    const token = this.randomId();
    drops.set(token, [...paths]);
    for (const old of [...drops.keys()].slice(0, Math.max(0, drops.size - KEPT))) drops.delete(old);
    return token;
  }

  /** The dropped files, once; null for a token this window wasn't given or already used. */
  take(window: number, token: string): readonly string[] | null {
    const drops = this.drops.get(window);
    const paths = drops?.get(token) ?? null;
    drops?.delete(token);
    return paths;
  }

  closeWindow(window: number): void {
    this.drops.delete(window);
  }
}
