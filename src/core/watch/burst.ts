import type { Clock, Unsubscribe } from '../ports';

/** A burst is delivered once it has been quiet this long… */
const QUIET_MS = 75;
/** …or this long after its first event, whichever comes first. */
const MAX_WAIT_MS = 250;
/** At most one delivery per interval: 4 a second while an agent streams into a file. */
const MIN_INTERVAL_MS = 250;

/** Folds a burst of events into few deliveries, never an intermediate one alone (a save, a stream of appends). */
export interface Burst {
  /** An event happened now. */
  note(): void;
  /** Drops a delivery that is due. */
  cancel(): void;
}

export function burst(clock: Clock, deliver: () => void): Burst {
  let firstAt: number | null = null;
  let lastAt = -Infinity;
  let lastDelivered = -Infinity;
  let cancelDelivery: Unsubscribe | null = null;

  const fire = (): void => {
    cancelDelivery = null;
    firstAt = null;
    lastDelivered = clock.now();
    deliver();
  };

  return {
    note() {
      lastAt = clock.now();
      firstAt ??= lastAt;
      const due = Math.max(Math.min(lastAt + QUIET_MS, firstAt + MAX_WAIT_MS), lastDelivered + MIN_INTERVAL_MS);
      cancelDelivery?.();
      cancelDelivery = clock.setTimeout(fire, Math.max(0, due - clock.now()));
    },
    cancel() {
      cancelDelivery?.();
      cancelDelivery = null;
      firstAt = null;
    },
  };
}
