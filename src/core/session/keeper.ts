import type { Clock } from '../ports';
import type { TabRegistry } from '../tabs/registry';
import type { SessionFile, WindowBounds } from './model';
import { SaveScheduler } from './scheduler';

export interface SessionKeeperDeps {
  tabs: TabRegistry;
  clock: Clock;
  save: (session: SessionFile) => Promise<void>;
  /** The profile's windows, in the order they were opened. */
  windows: () => readonly { id: number; bounds: WindowBounds | null }[];
  /** Window ids, the last focused first. */
  focusOrder: () => readonly number[];
  /** False until the session was restored and windows opened; nothing is saved before (default true). */
  running?: boolean;
}

/** Keeps a profile's session written (ADR-005): 2 s after a change, at least every 10 s, and on quit. */
export class SessionKeeper {
  private readonly scheduler: SaveScheduler;
  private held: SessionFile | null = null;
  private running: boolean;

  constructor(private readonly deps: SessionKeeperDeps) {
    this.running = deps.running ?? true;
    this.scheduler = new SaveScheduler({
      clock: deps.clock,
      save: () => deps.save(this.capture()),
      quietMs: 2_000,
      maxMs: 10_000,
    });
  }

  /** The session is restored and its windows are open: from now on it is kept. */
  start(): void {
    this.running = true;
  }

  changed(): void {
    if (this.running && !this.held) this.scheduler.changed();
  }

  /** The session as it is; `without` leaves out a window that closes because its last tab moved away (ADR-019). */
  capture(without?: number): SessionFile {
    const windows = this.deps.windows().filter((window) => window.id !== without);
    const ids = windows.map((window) => window.id);
    return {
      savedAt: this.deps.clock.now(),
      windows: windows.map((window) => ({ bounds: window.bounds, ...this.deps.tabs.exportWindow(window.id) })),
      focusOrder: this.deps.focusOrder().map((id) => ids.indexOf(id)).filter((index) => index >= 0),
    };
  }

  /** The last window is closing: what it holds now is what the quit saves, not the empty aftermath. */
  holdForQuit({ without }: { without?: number } = {}): void {
    this.held = this.capture(without);
    this.scheduler.stop();
  }

  /** A window opened after the last one closed (macOS keeps running): keep saving. */
  resume(): void {
    this.held = null;
    this.scheduler.resume();
  }

  /** Before any window opened (a quit at the sandbox prompt), there is nothing to save: the last session stays. */
  async flushOnQuit(): Promise<void> {
    this.scheduler.stop();
    if (this.running) await this.deps.save(this.held ?? this.capture());
  }
}
