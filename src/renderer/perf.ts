declare const __GALEO_PERF__: boolean;

/**
 * Marks the frame after the current one as painted (`galeo:first-paint` in the page's performance
 * timeline) for the performance harness. Only builds made with `GALEO_PERF=1` contain it.
 */
export function markFirstPaint(): void {
  if (!__GALEO_PERF__) return;
  requestAnimationFrame(() => setTimeout(() => performance.mark('galeo:first-paint')));
}
