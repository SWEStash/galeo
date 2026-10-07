import { describe, expect, it } from 'vitest';
import { wheelZoom } from './wheel-zoom';

const wheel = (deltaY: number, deltaMode = 0) => ({ deltaY, deltaMode });

describe('wheelZoom', () => {
  it('zooms in one step for a notch up, out for a notch down', () => {
    expect(wheelZoom(0, wheel(-120))).toEqual({ step: 'in', pending: 0 });
    expect(wheelZoom(0, wheel(53))).toEqual({ step: 'out', pending: 0 });
    expect(wheelZoom(0, wheel(-3, 1))).toEqual({ step: 'in', pending: 0 });
  });

  it('adds up small touchpad deltas into a step, then starts again', () => {
    let pending = 0;
    const steps: (string | null)[] = [];
    for (const delta of [-10, -15, -20, -10]) {
      const result = wheelZoom(pending, wheel(delta));
      steps.push(result.step);
      pending = result.pending;
    }
    expect(steps).toEqual([null, null, null, 'in']);
    expect(pending).toBe(0);
  });

  it('drops what was building up when the direction turns', () => {
    const { pending } = wheelZoom(0, wheel(-30));
    expect(wheelZoom(pending, wheel(20))).toEqual({ step: null, pending: 20 });
  });

  it('ignores a sideways or empty wheel', () => {
    expect(wheelZoom(12, wheel(0))).toEqual({ step: null, pending: 12 });
  });
});
