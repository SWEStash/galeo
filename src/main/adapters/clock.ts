import type { Clock } from '../../core/ports';

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => {
    const timer = setTimeout(callback, ms);
    return () => clearTimeout(timer);
  },
};
