import type { WindowState } from '../tabs/registry';

/** Where a window was; restored where the platform allows (Wayland decides positions itself). */
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

interface SessionWindow extends WindowState {
  bounds: WindowBounds | null;
}

/**
 * A profile's session (ADR-005): its windows and their tabs, as paths, view state and positions
 * only, never document content (SR-16).
 */
export interface SessionFile {
  /** When it was written, in ms since the epoch. */
  savedAt: number;
  windows: SessionWindow[];
  /** Window indices, the last focused first. */
  focusOrder: number[];
}

export const SESSION_VERSION = 1;
