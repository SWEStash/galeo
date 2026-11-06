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

/** 2 (v0.7): a tab may be pinned. A version 1 file has no pins, so it reads as it is. */
export const SESSION_VERSION = 2;
export const SESSION_MIGRATIONS = { 1: (data: Record<string, unknown>) => data };
