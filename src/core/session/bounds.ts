import type { WindowBounds } from './model';

interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How much of a restored window must be on a display to keep its place. */
const MIN_VISIBLE = 100;

/**
 * A restored window's bounds for today's displays: a window no display shows well enough (its
 * monitor is gone) keeps its size, and the platform places it.
 */
export function visibleBounds(bounds: WindowBounds, displays: readonly Area[]): Partial<WindowBounds> & Pick<WindowBounds, 'width' | 'height' | 'maximized'> {
  const shown = displays.some((area) => {
    const width = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
    const height = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
    return width >= MIN_VISIBLE && height >= MIN_VISIBLE;
  });
  if (shown) return bounds;
  const { width, height, maximized } = bounds;
  return { width, height, maximized };
}
