import type { Clock, Unsubscribe } from '../ports';

/** A page's answer: it put the question to the reader (`asking`), then what they chose. */
export type CloseAnswer = 'asking' | 'proceed' | 'cancel';

interface Pending {
  resolve: (proceed: boolean) => void;
  stopTimer: Unsubscribe;
}

/**
 * Closing windows, quitting or deleting a profile with unsaved changes (ADR-013): each affected
 * window's page asks its reader, one window at a time, and the close goes ahead only if every
 * reader agrees. A page must say it is asking within `ackMs`, or it counts as Cancel (a hung page
 * can't hang a quit); a reader may take as long as they like to decide.
 */
export class UnsavedChanges {
  private readonly pending = new Map<number, Pending>();

  constructor(
    private readonly deps: {
      /** The window's tabs with unsaved changes. */
      dirty: (window: number) => string[];
      /** Asks the window's page about these tabs. */
      ask: (window: number, ids: string[]) => void;
      clock: Clock;
      ackMs: number;
    },
  ) {}

  async confirm(windows: readonly number[]): Promise<boolean> {
    for (const window of windows) {
      const ids = this.deps.dirty(window);
      if (ids.length === 0) continue;
      if (!(await this.askOne(window, ids))) return false;
    }
    return true;
  }

  answer(window: number, answer: CloseAnswer): void {
    const pending = this.pending.get(window);
    if (!pending) return;
    pending.stopTimer();
    if (answer === 'asking') return;
    this.settle(window, answer === 'proceed');
  }

  /** The window went away while asked: nothing of it is left to lose. */
  closeWindow(window: number): void {
    this.settle(window, true);
  }

  private askOne(window: number, ids: string[]): Promise<boolean> {
    this.settle(window, false);
    return new Promise((resolve) => {
      const stopTimer = this.deps.clock.setTimeout(() => this.settle(window, false), this.deps.ackMs);
      this.pending.set(window, { resolve, stopTimer });
      this.deps.ask(window, ids);
    });
  }

  private settle(window: number, proceed: boolean): void {
    const pending = this.pending.get(window);
    if (!pending) return;
    this.pending.delete(window);
    pending.stopTimer();
    pending.resolve(proceed);
  }
}
