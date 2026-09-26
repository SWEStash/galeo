import type { Clock, Unsubscribe } from '../../../src/core/ports';

interface Timer {
  at: number;
  seq: number;
  callback: () => void;
}

/** Manual time: nothing happens until `advance` moves the clock past a timer. */
export class FakeClock implements Clock {
  private timers: Timer[] = [];
  private seq = 0;

  constructor(private time = 0) {}

  now(): number {
    return this.time;
  }

  setTimeout(callback: () => void, ms: number): Unsubscribe {
    const timer = { at: this.time + ms, seq: this.seq++, callback };
    this.timers.push(timer);
    return () => {
      this.timers = this.timers.filter((t) => t !== timer);
    };
  }

  advance(ms: number): void {
    const end = this.time + ms;
    for (;;) {
      const next = this.timers
        .filter((t) => t.at <= end)
        .sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (!next) break;
      this.timers = this.timers.filter((t) => t !== next);
      this.time = next.at;
      next.callback();
    }
    this.time = end;
  }
}
