import { describe, expect, it } from 'vitest';
import { actualSize, fit, MAX_SCALE, MIN_SCALE, panBy, zoomAt } from './viewer-math';

const viewport = { width: 1000, height: 600 };

describe('fit', () => {
  it('scales a wide diagram to the viewport width, centred, inside a margin', () => {
    // 2000 × 400 in 1000 × 600 with 24 px margins: width decides, (1000 - 48) / 2000.
    const view = fit({ width: 2000, height: 400 }, viewport);
    expect(view.scale).toBeCloseTo(0.476, 3);
    expect(view.x).toBeCloseTo(24, 3);
    expect(view.y).toBeCloseTo((600 - 400 * view.scale) / 2, 3);
  });

  it('scales a tall one to the height, centred across', () => {
    const view = fit({ width: 200, height: 1200 }, viewport);
    expect(view.scale).toBeCloseTo(552 / 1200, 3);
    expect(view.x).toBeCloseTo((1000 - 200 * view.scale) / 2, 3);
  });

  it('enlarges a small one to fill the viewport, but no further than the largest zoom', () => {
    expect(fit({ width: 400, height: 100 }, viewport).scale).toBeCloseTo(952 / 400, 3);
    expect(fit({ width: 10, height: 5 }, viewport).scale).toBe(MAX_SCALE);
  });
});

describe('actualSize', () => {
  it('shows the diagram at its natural size, centred', () => {
    expect(actualSize({ width: 400, height: 200 }, viewport)).toEqual({ scale: 1, x: 300, y: 200 });
  });
});

describe('zoomAt', () => {
  it('keeps the point under the pointer where it is', () => {
    const before = { scale: 1, x: 100, y: 50 };
    const after = zoomAt(before, 2, { x: 300, y: 250 });
    expect(after.scale).toBe(2);
    // The diagram point under (300, 250) was (200, 200) and still is: 300 = x + 200 × 2.
    expect(after.x).toBe(-100);
    expect(after.y).toBe(-150);
  });

  it('stops at the smallest and largest zoom, and then moves nothing', () => {
    expect(zoomAt({ scale: MIN_SCALE, x: 0, y: 0 }, 0.5, { x: 100, y: 100 })).toEqual({ scale: MIN_SCALE, x: 0, y: 0 });
    expect(zoomAt({ scale: 6, x: 0, y: 0 }, 2, { x: 0, y: 0 }).scale).toBe(MAX_SCALE);
  });
});

describe('panBy', () => {
  it('moves the diagram by the drag', () => {
    expect(panBy({ scale: 2, x: 10, y: 20 }, -30, 15)).toEqual({ scale: 2, x: -20, y: 35 });
  });
});
