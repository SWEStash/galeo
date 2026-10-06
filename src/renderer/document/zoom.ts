/** Zoom levels, as browsers step through them. */
export const ZOOM_LEVELS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

/** The tab's next zoom for Ctrl++ (`in`), Ctrl+- (`out`) or Ctrl+0 (`reset`). */
export function zoomStep(current: number, direction: 'in' | 'out' | 'reset'): number {
  if (direction === 'reset') return 1;
  if (direction === 'in') return ZOOM_LEVELS.find((level) => level > current + 1e-9) ?? ZOOM_LEVELS.at(-1)!;
  return [...ZOOM_LEVELS].reverse().find((level) => level < current - 1e-9) ?? ZOOM_LEVELS[0];
}
