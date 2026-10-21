import type { Clock } from '../ports';

/**
 * Holds back a launch's first window until the desktop's theme settings have arrived. On Linux,
 * Chromium reads them over D-Bus after the app is ready and re-themes every window when they land;
 * with a window already open that takes some 300 ms of the main thread, which the page then waits
 * behind (ARCHITECTURE §5.6). Opens after `updates` theme updates, or at `capMs` from its creation
 * for a desktop that sends fewer.
 */
export class ThemeGate {
  private seen = 0;
  private readonly open: Promise<void>;
  private release!: () => void;

  constructor(private readonly options: { clock: Clock; updates: number; capMs: number }) {
    this.open = new Promise((resolve) => (this.release = resolve));
    if (options.updates <= 0) this.release();
    else options.clock.setTimeout(() => this.release(), options.capMs);
  }

  /** The platform's native theme changed. */
  updated(): void {
    if (++this.seen >= this.options.updates) this.release();
  }

  /** Resolves once the first window may be built. */
  opened(): Promise<void> {
    return this.open;
  }
}
