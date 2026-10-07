/** A wheel turn this far, in pixels, is one zoom step: a mouse notch is at least this much. */
const NOTCH = 50;
const LINE = 40;

/**
 * Ctrl and the wheel zoom the shown tab (UX §5): one step per mouse notch, up to zoom in. A
 * touchpad pinch sends many small turns; they add up (`pending`) until they make a step, and a
 * turn the other way starts again.
 */
export function wheelZoom(pending: number, { deltaY, deltaMode }: { deltaY: number; deltaMode: number }): { step: 'in' | 'out' | null; pending: number } {
  if (deltaY === 0) return { step: null, pending };
  const delta = deltaMode === 0 ? deltaY : deltaY * LINE;
  const total = Math.sign(pending) === Math.sign(delta) ? pending + delta : delta;
  if (Math.abs(total) < NOTCH) return { step: null, pending: total };
  return { step: total < 0 ? 'in' : 'out', pending: 0 };
}
