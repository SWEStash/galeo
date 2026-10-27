/** The tab strip's scroll geometry (UX §8): pure, so the browser's layout stays out of the tests. */

/** Less than a pixel from an end counts as the end (fractional widths and zoom). */
const SLACK = 1;

/** Whether the tabs overflow the strip, and which ways it can still scroll. */
export function overflowEdges({ scrollLeft, scrollWidth, clientWidth }: { scrollLeft: number; scrollWidth: number; clientWidth: number }) {
  const overflows = scrollWidth - clientWidth > SLACK;
  return { overflows, canLeft: overflows && scrollLeft >= SLACK, canRight: overflows && scrollLeft < scrollWidth - clientWidth - SLACK };
}

const LINE = 16;

/**
 * How far a wheel turn scrolls the strip sideways, in pixels: the larger of its two axes, so a
 * mouse wheel (vertical) and a touchpad swipe (horizontal) both move it. `page` is the strip's width.
 */
export function wheelScroll({ deltaX, deltaY, deltaMode }: { deltaX: number; deltaY: number; deltaMode: number }, page = 0): number {
  const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
  return delta * (deltaMode === 1 ? LINE : deltaMode === 2 ? page : 1);
}

/** Which way the tabs run: along the tab bar (x) or down the side panel (y). */
export type Axis = 'x' | 'y';

/** A box's extent along the tabs' axis. */
interface Span {
  start: number;
  end: number;
  size: number;
}

export function spanOf(rect: { left: number; right: number; width: number; top: number; bottom: number; height: number }, axis: Axis): Span {
  return axis === 'x' ? { start: rect.left, end: rect.right, size: rect.width } : { start: rect.top, end: rect.bottom, size: rect.height };
}

/**
 * Where a drop `at` pixels from the strip's start edge lands: before the first tab whose middle is past
 * it. `offset` places the caret inside the strip's scrolled content, so it adds the scroll offset.
 */
export function insertion(at: number, strip: { start: number; scroll: number }, tabs: readonly Span[]) {
  const found = tabs.findIndex((tab) => strip.start + at < tab.start + tab.size / 2);
  const index = found < 0 ? tabs.length : found;
  const edge = index < tabs.length ? tabs[index]!.start : (tabs.at(-1)?.end ?? strip.start);
  return { index, offset: edge - strip.start + strip.scroll };
}
