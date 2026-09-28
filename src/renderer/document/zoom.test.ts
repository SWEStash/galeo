import { describe, expect, it } from 'vitest';
import { zoomStep, ZOOM_LEVELS } from './zoom';

describe('zoomStep', () => {
  it('moves to the next level in or out, staying at the ends', () => {
    expect(zoomStep(1, 'in')).toBe(1.1);
    expect(zoomStep(1, 'out')).toBe(0.9);
    expect(zoomStep(ZOOM_LEVELS.at(-1)!, 'in')).toBe(ZOOM_LEVELS.at(-1));
    expect(zoomStep(ZOOM_LEVELS[0]!, 'out')).toBe(ZOOM_LEVELS[0]);
  });

  it('resets to 100%', () => {
    expect(zoomStep(2, 'reset')).toBe(1);
  });

  it('moves from a level between two steps to the next one in that direction', () => {
    expect(zoomStep(1.05, 'in')).toBe(1.1);
    expect(zoomStep(1.05, 'out')).toBe(1);
  });
});
