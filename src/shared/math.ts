/** `value` within `min` and `max`; the upper bound wins when they cross. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A fraction within 0 and 1. */
export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
