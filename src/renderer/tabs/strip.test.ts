import { describe, expect, it } from 'vitest';
import { insertion, overflowEdges, wheelScroll } from './strip';

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
  // Three 100 px tabs from x = 10 (the strip's left edge) in the viewport.
  const tabs = [10, 110, 210].map((left) => ({ left, right: left + 100, width: 100 }));

  it('puts the caret before the tab whose middle is past the pointer, or after the last', () => {
    expect(insertion(30, { left: 10, scrollLeft: 0 }, tabs)).toEqual({ index: 0, left: 0 });
    expect(insertion(70, { left: 10, scrollLeft: 0 }, tabs)).toEqual({ index: 1, left: 100 });
    expect(insertion(290, { left: 10, scrollLeft: 0 }, tabs)).toEqual({ index: 3, left: 300 });
  });

  it('places the caret in the scrolled content, not the visible box, when the strip is scrolled', () => {
    // Scrolled by 150: the tabs' viewport positions moved left by 150, the caret's offset adds it back.
    const scrolled = tabs.map(({ left, right, width }) => ({ left: left - 150, right: right - 150, width }));
    expect(insertion(70, { left: 10, scrollLeft: 150 }, scrolled)).toEqual({ index: 2, left: 200 });
  });

  it('is the start with no tabs', () => {
    expect(insertion(50, { left: 10, scrollLeft: 0 }, [])).toEqual({ index: 0, left: 0 });
  });
});
