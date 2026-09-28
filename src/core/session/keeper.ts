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
}

/** Keeps a profile's session written (ADR-005): 2 s after a change, at least every 10 s, and on quit. */
export class SessionKeeper {
  private readonly scheduler: SaveScheduler;
  private held: SessionFile | null = null;

  constructor(private readonly deps: SessionKeeperDeps) {
    this.scheduler = new SaveScheduler({
      clock: deps.clock,
      save: () => deps.save(this.capture()),
      quietMs: 2_000,
      maxMs: 10_000,
    });
  }

  changed(): void {
    if (!this.held) this.scheduler.changed();
  }

  capture(): SessionFile {
    const windows = this.deps.windows();
    const ids = windows.map((window) => window.id);
    return {
      savedAt: this.deps.clock.now(),
      windows: windows.map((window) => ({ bounds: window.bounds, ...this.deps.tabs.exportWindow(window.id) })),
      focusOrder: this.deps.focusOrder().map((id) => ids.indexOf(id)).filter((index) => index >= 0),
    };
  }

  /** The last window is closing: what it holds now is what the quit saves, not the empty aftermath. */
  holdForQuit(): void {
    this.held = this.capture();
    this.scheduler.stop();
  }

  async flushOnQuit(): Promise<void> {
    this.scheduler.stop();
    await this.deps.save(this.held ?? this.capture());
  }
}
