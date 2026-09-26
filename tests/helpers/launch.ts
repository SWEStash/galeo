import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

export interface LaunchedApp {
  app: ElectronApplication;
  window: Page;
  close: () => Promise<void>;
}

/**
 * Starts the built app (`npm run build` first) with isolated XDG config/state/cache directories,
 * and returns it with its first window.
 */
export async function launchApp(args: string[] = []): Promise<LaunchedApp> {
  const home = mkdtempSync(path.join(tmpdir(), 'galeo-e2e-'));
  const app = await electron.launch({
    args: ['.', ...args],
    chromiumSandbox: true,
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: {
      ...process.env,
      XDG_CONFIG_HOME: path.join(home, 'config'),
      XDG_STATE_HOME: path.join(home, 'state'),
      XDG_CACHE_HOME: path.join(home, 'cache'),
    },
  });
  const window = await app.firstWindow();
  return {
    app,
    window,
    close: async () => {
      await app.close();
      rmSync(home, { recursive: true, force: true });
    },
  };
}
