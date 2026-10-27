import { describe, expect, it } from 'vitest';
import { clamp, clamp01 } from './math';

describe('clamp', () => {
  it('keeps a value within its bounds', () => {
    expect(clamp(5, 1, 10)).toBe(5);
    expect(clamp(-3, 1, 10)).toBe(1);
    expect(clamp(12, 1, 10)).toBe(10);
  });

  it('gives the upper bound when the bounds cross (an empty list clamps to -1)', () => {
    expect(clamp(0, 0, -1)).toBe(-1);
  });
});

describe('clamp01', () => {
  it('keeps a fraction between 0 and 1', () => {
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(-0.1)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
  });
});
