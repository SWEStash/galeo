import { describe, expect, it } from 'vitest';
import { visibleBounds } from './bounds';

const laptop = [{ x: 0, y: 0, width: 1920, height: 1080 }];
const bounds = (x: number, y: number) => ({ x, y, width: 1100, height: 800, maximized: false });

describe('visibleBounds', () => {
  it('keeps a window that is on a display', () => {
    expect(visibleBounds(bounds(100, 50), laptop)).toEqual(bounds(100, 50));
  });

  it('keeps the size but lets the platform place a window no display shows (a monitor gone)', () => {
    expect(visibleBounds(bounds(2500, 100), laptop)).toEqual({ width: 1100, height: 800, maximized: false });
  });

  it('needs a real part of the window on screen, not a sliver', () => {
    expect(visibleBounds(bounds(1900, 100), laptop)).toEqual({ width: 1100, height: 800, maximized: false });
  });
});
