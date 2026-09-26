import type { WindowId } from './window-host';

export interface SystemMetrics {
  /** Resident memory in bytes per window's renderer process. */
  sampleWindowMemory(): Promise<ReadonlyMap<WindowId, number>>;
}
