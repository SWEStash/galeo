import type { DocumentRecord } from './documents';

/** A tab in a snapshot: its record, zoom (absent at 100 %) and the last position main heard of. */
export interface TabView extends DocumentRecord {
  zoom?: number;
  position?: ScrollAnchor;
}

/** A window's tabs as main knows them, in order. A newer `revision` replaces an older snapshot (ADR-002). */
export interface TabSnapshot {
  revision: number;
  /** The tab the window last reported active, if it's still open. */
  active: string | null;
  tabs: TabView[];
}

/**
 * Where a tab is scrolled, as it survives a re-render (ADR-002): the first visible block's source
 * line and how far into it, else the heading above it, else the fraction of the way down.
 */
export interface ScrollAnchor {
  line: number;
  offset: number;
  heading: string | null;
  fraction: number;
}
