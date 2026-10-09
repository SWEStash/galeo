import { SPLIT_MAX_RATIO, SPLIT_MIN_RATIO } from '../../shared/formats';

/** How far one arrow key moves the divider, as a fraction of the width. */
const KEY_STEP = 0.05;

const clamp = (ratio: number) => Math.min(SPLIT_MAX_RATIO, Math.max(SPLIT_MIN_RATIO, ratio));

/** The ratio a key on the focused divider leads to (UX F13), or null for a key it doesn't take. */
export function ratioForKey(ratio: number, key: string): number | null {
  if (key === 'Home') return 0.5;
  if (key === 'ArrowLeft') return clamp(ratio - KEY_STEP);
  if (key === 'ArrowRight') return clamp(ratio + KEY_STEP);
  return null;
}

/** The ratio with the divider under the pointer, across a split box. */
export function ratioAt(clientX: number, box: { left: number; width: number }): number {
  return clamp((clientX - box.left) / box.width);
}
