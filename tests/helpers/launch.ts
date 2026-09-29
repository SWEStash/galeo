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
  /** Use this home (from `tempHome`) instead of a fresh one; the caller removes it. */
  home?: string;
}

/**
 * The app's folders under a test home: XDG on Linux; on macOS and Windows the app moves its app
 * data under the home itself (`GALEO_TEST_HOME`, unpackaged runs only).
 */
export function appDirs(home: string): { config: string; state: string; cache: string } {
  if (process.platform === 'linux') {
    return { config: path.join(home, 'config', 'galeo'), state: path.join(home, 'state', 'galeo'), cache: path.join(home, 'cache', 'galeo') };
  }
  const config = path.join(home, 'AppData', 'galeo');
  const cache = process.platform === 'win32' ? path.join(home, 'Local', 'galeo', 'Cache') : path.join(home, 'Library', 'Caches', 'galeo');
  return { config, state: path.join(config, 'State'), cache };
}

/** Removes a test home; on Windows, a killed app's child processes can hold its files for a moment. */
export function removeTempHome(home: string): void {
  rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}

/** A fresh isolated home, for tests that write config first or restart the app on the same one. */
export function tempHome(): string {
  return mkdtempSync(path.join(tmpdir(), 'galeo-e2e-'));
}

/**
 * Starts the built app (`npm run build` first) with isolated XDG config/state/cache directories,
 * and returns it with its first window.
 */
export async function launchApp(args: string[] = [], options: LaunchOptions = {}): Promise<LaunchedApp> {
  const home = options.home ?? tempHome();
  const removeHome = () => {
    if (!options.home) removeTempHome(home);
  };
  let app: ElectronApplication;
  let window: Page;
  try {
    app = await electron.launch({
      args: ['.', ...args],
      chromiumSandbox: true,
      // Playwright emulates a light `prefers-color-scheme` by default; the app must see the real one.
      colorScheme: null,
      ...(options.executablePath ? { executablePath: options.executablePath } : {}),
      cwd: path.resolve(import.meta.dirname, '../..'),
      env: {
        ...process.env,
        XDG_CONFIG_HOME: path.join(home, 'config'),
        XDG_STATE_HOME: path.join(home, 'state'),
        XDG_CACHE_HOME: path.join(home, 'cache'),
        GALEO_TEST_HOME: home,
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
