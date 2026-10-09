import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pauseOrMax } from './pause-or-max';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('pauseOrMax', () => {
  it('runs once typing pauses for the pause', () => {
    const run = vi.fn();
    const timing = pauseOrMax(run, { pauseMs: 150, maxMs: 1000 });
    timing.poke();
    vi.advanceTimersByTime(100);
    timing.poke();
    vi.advanceTimersByTime(149);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledOnce();
  });

  it('runs at least every max while typing goes on', () => {
    const run = vi.fn();
    const timing = pauseOrMax(run, { pauseMs: 150, maxMs: 1000 });
    for (let elapsed = 0; elapsed < 2500; elapsed += 100) {
      timing.poke();
      vi.advanceTimersByTime(100);
    }
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does nothing more once cancelled', () => {
    const run = vi.fn();
    const timing = pauseOrMax(run, { pauseMs: 150, maxMs: 1000 });
    timing.poke();
    timing.cancel();
    vi.advanceTimersByTime(2000);
    expect(run).not.toHaveBeenCalled();
  });
});
