/**
 * What lets go of a closed window's state (ADR-026). Each place that keeps state per window registers
 * its cleanup where it is created; a closing window runs them in the order they registered.
 */
export class WindowCleanups {
  private readonly cleanups: Array<(window: number) => void> = [];

  add(cleanup: (window: number) => void): void {
    this.cleanups.push(cleanup);
  }

  run(window: number): void {
    for (const cleanup of this.cleanups) cleanup(window);
  }
}
