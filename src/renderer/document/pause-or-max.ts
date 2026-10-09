/**
 * Runs `run` once pokes pause for `pauseMs`, and at least every `maxMs` while they go on: a live
 * preview that follows typing without rendering every keystroke (ADR-014).
 */
export function pauseOrMax(run: () => void, { pauseMs, maxMs }: { pauseMs: number; maxMs: number }): { poke(): void; cancel(): void } {
  let pause: ReturnType<typeof setTimeout> | undefined;
  let max: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(pause);
    clearTimeout(max);
    pause = max = undefined;
  };
  const fire = () => {
    cancel();
    run();
  };
  return {
    poke() {
      clearTimeout(pause);
      pause = setTimeout(fire, pauseMs);
      max ??= setTimeout(fire, maxMs);
    },
    cancel,
  };
}
