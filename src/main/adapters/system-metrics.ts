import { app, BrowserWindow } from 'electron';
import type { SystemMetrics } from '../../core/ports';

interface ProcessMemory {
  pid: number;
  /** Kilobytes, as `app.getAppMetrics()` reports them. */
  memory: { workingSetSize: number };
}

/** Each window's renderer working set in bytes, keyed by its web contents id. */
export function windowMemory(
  windows: readonly { id: number; pid: number }[],
  metrics: readonly ProcessMemory[],
): Map<number, number> {
  const byPid = new Map(metrics.map((metric) => [metric.pid, metric.memory.workingSetSize * 1024]));
  const memory = new Map<number, number>();
  for (const window of windows) {
    const bytes = byPid.get(window.pid);
    if (bytes !== undefined) memory.set(window.id, bytes);
  }
  return memory;
}

/** `SystemMetrics` on `app.getAppMetrics()` (ADR-002 memory pressure). */
export const electronSystemMetrics: SystemMetrics = {
  sampleWindowMemory: async () =>
    windowMemory(
      BrowserWindow.getAllWindows().map((window) => ({
        id: window.webContents.id,
        pid: window.webContents.getOSProcessId(),
      })),
      app.getAppMetrics(),
    ),
};
