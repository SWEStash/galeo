import type { Clock, SystemMetrics, Unsubscribe } from '../ports';

export interface MemoryPressureDeps {
  clock: Clock;
  metrics: SystemMetrics;
  intervalMs: number;
  /** A window's renderer above this many bytes is under pressure. */
  thresholdBytes: number;
  onPressure: (window: number) => void;
}

/** Samples each window's renderer memory on an interval and reports the ones over the threshold (ADR-002). */
export class MemoryPressure {
  private cancel: Unsubscribe | null = null;

  constructor(private readonly deps: MemoryPressureDeps) {}

  start(): void {
    this.schedule();
  }

  stop(): void {
    this.cancel?.();
    this.cancel = null;
  }

  private schedule(): void {
    this.cancel = this.deps.clock.setTimeout(() => void this.sample(), this.deps.intervalMs);
  }

  private async sample(): Promise<void> {
    try {
      const samples = await this.deps.metrics.sampleWindowMemory();
      for (const [window, bytes] of samples) if (bytes > this.deps.thresholdBytes) this.deps.onPressure(window);
    } catch {
      // A failed sample is skipped; the next one decides.
    }
    if (this.cancel) this.schedule();
  }
}
