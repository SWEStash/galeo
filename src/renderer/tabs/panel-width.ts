/** The side tab panel's width (ADR-023 point 6): pure, so the browser's layout stays out of the tests. */

import { TAB_PANEL_DEFAULT, TAB_PANEL_MAX, TAB_PANEL_MIN } from '../../shared/settings';

const KEY_STEP = 16;
/** Dragged narrower than this, the panel collapses. */
const COLLAPSE_UNDER = 100;
/** The document keeps at least this much of a narrow window. */
const DOCUMENT_MIN = 320;

const clamp = (width: number) => Math.min(TAB_PANEL_MAX, Math.max(TAB_PANEL_MIN, Math.round(width)));

/** The width after a key on the divider: ←/→ by 16 px, Home back to the default; null for other keys. */
export function widthForKey(width: number, key: string): number | null {
  if (key === 'Home') return TAB_PANEL_DEFAULT;
  if (key === 'ArrowLeft') return clamp(width - KEY_STEP);
  if (key === 'ArrowRight') return clamp(width + KEY_STEP);
  return null;
}

/** What a divider drag `at` pixels from the panel's left edge asks for. */
export function panelDrag(at: number): { collapsed: true } | { collapsed: false; width: number } {
  return at < COLLAPSE_UNDER ? { collapsed: true } : { collapsed: false, width: clamp(at) };
}

/** The width drawn in a window `windowWidth` wide: narrower than the stored one if the document needs the room. */
export function shownPanelWidth(width: number, windowWidth: number): number {
  return Math.max(TAB_PANEL_MIN, Math.min(width, windowWidth - DOCUMENT_MIN));
}
