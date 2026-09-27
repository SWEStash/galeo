import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

export interface LaunchedApp {
  app: ElectronApplication;
  window: Page;
  /** The isolated home: `config`, `state` and `cache` are its XDG directories. */
  home: string;
  close: () => Promise<void>;
}

export interface LaunchOptions {
  /** Extra environment variables for the app. */
  env?: Record<string, string>;
  /** Run this instead of the Electron binary (for example a wrapper that traces it). */
  executablePath?: string;
}

/**
 * Starts the built app (`npm run build` first) with isolated XDG config/state/cache directories,
 * and returns it with its first window.
 */
export async function launchApp(args: string[] = [], options: LaunchOptions = {}): Promise<LaunchedApp> {
  const home = mkdtempSync(path.join(tmpdir(), 'galeo-e2e-'));
  const removeHome = () => rmSync(home, { recursive: true, force: true });
  let app: ElectronApplication;
  let window: Page;
  try {
    app = await electron.launch({
      args: ['.', ...args],
      chromiumSandbox: true,
      ...(options.executablePath ? { executablePath: options.executablePath } : {}),
      cwd: path.resolve(import.meta.dirname, '../..'),
      env: {
        ...process.env,
        XDG_CONFIG_HOME: path.join(home, 'config'),
        XDG_STATE_HOME: path.join(home, 'state'),
        XDG_CACHE_HOME: path.join(home, 'cache'),
        ...options.env,
      },
    });
    window = await app.firstWindow();
  } catch (error) {
    removeHome();
    throw error;
  }
  return {
    app,
    window,
    home,
    close: async () => {
      try {
        await app.close();
      } finally {
        removeHome();
      }
    },
  };
}
