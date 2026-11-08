import type { WindowState } from '../tabs/registry';

/** Where a window was; restored where the platform allows (Wayland decides positions itself). */
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

/** The folder a window watches (ADR-034), and whether its panel is open. */
export interface WindowWatch {
  folder: string;
  panel: boolean;
}

interface SessionWindow extends WindowState {
  bounds: WindowBounds | null;
  watch?: WindowWatch;
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

/**
 * 2 (v0.7): a tab may be pinned. 3 (v0.8): a window may watch a folder. Older files have neither,
 * so they read as they are.
 */
export const SESSION_VERSION = 3;
const asIs = (data: Record<string, unknown>) => data;
export const SESSION_MIGRATIONS = { 1: asIs, 2: asIs };
