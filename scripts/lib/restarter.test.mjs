import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRestarter } from './restarter.mjs';

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

describe('createRestarter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('restarts once, after the delay', async () => {
    const restart = vi.fn(async () => {});
    const restarter = createRestarter({ restart, delayMs: 100 });

    restarter.request();
    await vi.advanceTimersByTimeAsync(99);
    expect(restart).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst of requests into one restart', async () => {
    const restart = vi.fn(async () => {});
    const restarter = createRestarter({ restart, delayMs: 100 });

    restarter.request();
    await vi.advanceTimersByTimeAsync(50);
    restarter.request();
    await vi.advanceTimersByTimeAsync(50);
    restarter.request();
    await vi.advanceTimersByTimeAsync(100);
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('runs exactly one more restart when requested while one is running', async () => {
    const first = deferred();
    const restart = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const restarter = createRestarter({ restart, delayMs: 100 });

    restarter.request();
    await vi.advanceTimersByTimeAsync(100);
    restarter.request();
    restarter.request();
    await vi.advanceTimersByTimeAsync(100);
    expect(restart).toHaveBeenCalledTimes(1);

    first.resolve();
    await vi.advanceTimersByTimeAsync(100);
    expect(restart).toHaveBeenCalledTimes(2);
  });

  it('keeps working after a restart fails', async () => {
    const restart = vi.fn().mockRejectedValueOnce(new Error('spawn failed')).mockResolvedValue(undefined);
    const onError = vi.fn();
    const restarter = createRestarter({ restart, delayMs: 100, onError });

    restarter.request();
    await vi.advanceTimersByTimeAsync(100);
    expect(onError).toHaveBeenCalledWith(new Error('spawn failed'));

    restarter.request();
    await vi.advanceTimersByTimeAsync(100);
    expect(restart).toHaveBeenCalledTimes(2);
  });

  it('cancel drops a scheduled restart', async () => {
    const restart = vi.fn(async () => {});
    const restarter = createRestarter({ restart, delayMs: 100 });

    restarter.request();
    restarter.cancel();
    await vi.advanceTimersByTimeAsync(200);
    expect(restart).not.toHaveBeenCalled();
  });
});
