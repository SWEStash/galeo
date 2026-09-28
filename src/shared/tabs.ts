import type { DocumentRecord } from './documents';

/** A window's tabs as main knows them, in order. A newer `revision` replaces an older snapshot (ADR-002). */
export interface TabSnapshot {
  revision: number;
  /** The tab the window last reported active, if it's still open. */
  active: string | null;
  tabs: DocumentRecord[];
}
