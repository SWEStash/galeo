import { describe, expect, it } from 'vitest';
import { ratioAt, ratioForKey } from './split-divider';

describe('ratioForKey', () => {
  it('moves the divider a twentieth of the width per arrow key', () => {
    expect(ratioForKey(0.5, 'ArrowRight')).toBeCloseTo(0.55);
    expect(ratioForKey(0.5, 'ArrowLeft')).toBeCloseTo(0.45);
  });

  it('resets to half with Home', () => {
    expect(ratioForKey(0.3, 'Home')).toBe(0.5);
  });

  it('keeps each pane at least a fifth of the width', () => {
    expect(ratioForKey(0.22, 'ArrowLeft')).toBe(0.2);
    expect(ratioForKey(0.78, 'ArrowRight')).toBe(0.8);
  });

  it('ignores other keys', () => {
    expect(ratioForKey(0.5, 'ArrowUp')).toBeNull();
    expect(ratioForKey(0.5, 'a')).toBeNull();
  });
});

describe('ratioAt', () => {
  it('is where the pointer is across the split, clamped to the panes’ minimum', () => {
    expect(ratioAt(400, { left: 100, width: 1000 })).toBeCloseTo(0.3);
    expect(ratioAt(110, { left: 100, width: 1000 })).toBe(0.2);
    expect(ratioAt(1090, { left: 100, width: 1000 })).toBe(0.8);
  });
});
