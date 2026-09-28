export interface SystemMetrics {
  /** Resident memory in bytes of each window's renderer process, keyed by the window's id. */
  sampleWindowMemory(): Promise<ReadonlyMap<number, number>>;
}
