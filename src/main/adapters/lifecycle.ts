/** The part of Electron's `app` this adapter uses. */
export interface LifecycleApp {
  on(event: 'window-all-closed' | 'activate', listener: () => void): unknown;
  quit(): void;
}

/**
 * Platform conventions for the app's lifetime (ADR-005, ADR-007): closing the last window quits,
 * except on macOS, where the app stays alive and reopens a window when activated.
 */
export function installAppLifecycle(
  app: LifecycleApp,
  { platform, windowCount, openWindow }: { platform: NodeJS.Platform; windowCount: () => number; openWindow: () => void },
): void {
  app.on('window-all-closed', () => {
    if (platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (platform === 'darwin' && windowCount() === 0) openWindow();
  });
}
