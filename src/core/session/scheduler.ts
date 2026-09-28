import type { Clock, Unsubscribe } from '../ports';

export interface SaveSchedulerDeps {
  clock: Clock;
  save: () => Promise<void>;
  /** Saves this long after the last change. */
  quietMs: number;
  /** Saves at least this often while changes keep coming (scrolling). */
  maxMs: number;
}

/** When the session is written (ADR-005): after changes settle, at most every so often, and on quit. */
export class SaveScheduler {
  private quiet: Unsubscribe | null = null;
  private max: Unsubscribe | null = null;
  private stopped = false;

  constructor(private readonly deps: SaveSchedulerDeps) {}

  changed(): void {
    if (this.stopped) return;
    this.quiet?.();
    this.quiet = this.deps.clock.setTimeout(() => void this.save(), this.deps.quietMs);
    this.max ??= this.deps.clock.setTimeout(() => void this.save(), this.deps.maxMs);
  }

  /** Saves now, whatever is pending, and stops (the app is quitting). */
  async flush(): Promise<void> {
    this.stop();
    await this.deps.save();
  }

  stop(): void {
    this.stopped = true;
    this.cancel();
  }

  resume(): void {
    this.stopped = false;
  }

  private save(): Promise<void> {
    this.cancel();
    return this.deps.save();
  }

  private cancel(): void {
    this.quiet?.();
    this.max?.();
    this.quiet = null;
    this.max = null;
  }
}
