/** How long a credit stays usable after its input. */
const CREDIT_MS = 1000;
/** Credits a window holds at most. */
const MAX_CREDITS = 5;

/**
 * Real user input per window (ADR-004, threat T6): each keyboard or mouse input main sees earns
 * one short-lived credit, and requests that reach into the file system beyond what the window was
 * given spend one. A compromised page can't make input main sees, so it gets nothing done on its
 * own, and at most one such request per key the reader presses.
 */
export class InputCredits {
  private readonly credits = new Map<number, number[]>();
  /** Windows whose mouse button went down and hasn't come up: a drag starts however long the press. */
  private readonly held = new Set<number>();

  constructor(private readonly now: () => number) {}

  received(window: number): void {
    this.credits.set(window, [...this.live(window), this.now()].slice(-MAX_CREDITS));
  }

  spend(window: number): boolean {
    const live = this.live(window);
    if (live.length === 0) return false;
    this.credits.set(window, live.slice(1));
    return true;
  }

  pressed(window: number): void {
    this.held.add(window);
  }

  released(window: number): void {
    this.held.delete(window);
  }

  /** Spends the window's held mouse press, once. */
  spendPress(window: number): boolean {
    return this.held.delete(window);
  }

  closeWindow(window: number): void {
    this.credits.delete(window);
    this.held.delete(window);
  }

  private live(window: number): number[] {
    const now = this.now();
    return (this.credits.get(window) ?? []).filter((at) => now - at < CREDIT_MS);
  }
}
