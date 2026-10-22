import { describe, expect, it } from 'vitest';
import { insertion, overflowEdges, spanOf, wheelScroll } from './strip';

describe('overflowEdges', () => {
  it('has nothing to scroll while the tabs fit', () => {
    expect(overflowEdges({ scrollLeft: 0, scrollWidth: 600, clientWidth: 600 })).toEqual({ overflows: false, canLeft: false, canRight: false });
  });

  it('can scroll right at the start, both ways in the middle, left at the end', () => {
    expect(overflowEdges({ scrollLeft: 0, scrollWidth: 1000, clientWidth: 600 })).toEqual({ overflows: true, canLeft: false, canRight: true });
    expect(overflowEdges({ scrollLeft: 200, scrollWidth: 1000, clientWidth: 600 })).toEqual({ overflows: true, canLeft: true, canRight: true });
    expect(overflowEdges({ scrollLeft: 400, scrollWidth: 1000, clientWidth: 600 })).toEqual({ overflows: true, canLeft: true, canRight: false });
  });

  it('treats a sub-pixel remainder as the end (fractional zoom and widths)', () => {
    expect(overflowEdges({ scrollLeft: 399.5, scrollWidth: 1000, clientWidth: 600 }).canRight).toBe(false);
    expect(overflowEdges({ scrollLeft: 0.5, scrollWidth: 1000, clientWidth: 600 }).canLeft).toBe(false);
  });
});

describe('wheelScroll', () => {
  it('turns a vertical wheel into a horizontal scroll, and keeps a horizontal one', () => {
    expect(wheelScroll({ deltaX: 0, deltaY: 120, deltaMode: 0 })).toBe(120);
    expect(wheelScroll({ deltaX: -40, deltaY: 0, deltaMode: 0 })).toBe(-40);
  });

  it('follows the larger of the two on a diagonal touchpad swipe', () => {
    expect(wheelScroll({ deltaX: 30, deltaY: -10, deltaMode: 0 })).toBe(30);
    expect(wheelScroll({ deltaX: 5, deltaY: -50, deltaMode: 0 })).toBe(-50);
  });

  it('counts lines and pages in pixels', () => {
    expect(wheelScroll({ deltaX: 0, deltaY: 3, deltaMode: 1 })).toBe(48);
    expect(wheelScroll({ deltaX: 0, deltaY: 1, deltaMode: 2 }, 500)).toBe(500);
  });

  it('is 0 when the wheel did not move', () => {
    expect(wheelScroll({ deltaX: 0, deltaY: 0, deltaMode: 0 })).toBe(0);
  });
});

describe('insertion', () => {
  // Three 100 px tabs from 10 (the strip's start edge) in the viewport, along either axis.
  const tabs = [10, 110, 210].map((start) => ({ start, end: start + 100, size: 100 }));

  it('puts the caret before the tab whose middle is past the pointer, or after the last', () => {
    expect(insertion(30, { start: 10, scroll: 0 }, tabs)).toEqual({ index: 0, offset: 0 });
    expect(insertion(70, { start: 10, scroll: 0 }, tabs)).toEqual({ index: 1, offset: 100 });
    expect(insertion(290, { start: 10, scroll: 0 }, tabs)).toEqual({ index: 3, offset: 300 });
  });

  it('places the caret in the scrolled content, not the visible box, when the strip is scrolled', () => {
    // Scrolled by 150: the tabs' viewport positions moved back by 150, the caret's offset adds it back.
    const scrolled = tabs.map(({ start, end, size }) => ({ start: start - 150, end: end - 150, size }));
    expect(insertion(70, { start: 10, scroll: 150 }, scrolled)).toEqual({ index: 2, offset: 200 });
  });

  it('is the start with no tabs', () => {
    expect(insertion(50, { start: 10, scroll: 0 }, [])).toEqual({ index: 0, offset: 0 });
  });
});

describe('spanOf', () => {
  const rect = { left: 10, right: 210, width: 200, top: 40, bottom: 88, height: 48 };

  it('reads a box along the tab bar (x) or the side panel (y)', () => {
    expect(spanOf(rect, 'x')).toEqual({ start: 10, end: 210, size: 200 });
    expect(spanOf(rect, 'y')).toEqual({ start: 40, end: 88, size: 48 });
  });

  it('places the caret between rows of a scrolled side panel', () => {
    // Rows 48 px tall from the panel's top at 36, scrolled down by 96: the third row is at the top.
    const rows = [0, 1, 2, 3].map((n) => spanOf({ left: 0, right: 220, width: 220, top: 36 + n * 48 - 96, bottom: 36 + (n + 1) * 48 - 96, height: 48 }, 'y'));
    expect(insertion(30, { start: 36, scroll: 96 }, rows)).toEqual({ index: 3, offset: 144 });
    expect(insertion(10, { start: 36, scroll: 96 }, rows)).toEqual({ index: 2, offset: 96 });
  });
});
