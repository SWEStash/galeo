import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import electronBinary from 'electron';

const ROOT = path.resolve(import.meta.dirname, '../..');

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

/**
 * Removes a test home. On Windows a killed app's child processes can hold its files for a while
 * after it exits; when they still do after the retries, the folder is left in the temp folder with
 * a warning rather than failing a test whose own checks passed.
 */
export function removeTempHome(home: string): void {
  try {
    rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  } catch (error) {
    if (process.platform !== 'win32' || (error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
    console.warn(`left ${home}: ${(error as Error).message}`);
  }
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
      cwd: ROOT,
      env: { ...homeEnv(home), ...options.env },
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
        // A test that killed the app only waits for it to go: closing a killed app can wait for
        // the test's whole time on Windows.
        const process = app.process();
        if (!process.killed) await app.close();
        else if (process.exitCode === null && process.signalCode === null) await new Promise((exited) => process.once('exit', exited));
      } finally {
        removeHome();
      }
    },
  };
}

/**
 * Launches the app again on `home` while it runs there, as `galeo` would from a terminal in `cwd`:
 * it hands its arguments to the running instance and exits. Returns once it has.
 */
export function launchSecond(home: string, args: string[], options: { cwd?: string } = {}): SpawnSyncReturns<Buffer> {
  return spawnSync(electronBinary as unknown as string, [ROOT, ...args], { cwd: options.cwd ?? ROOT, timeout: 15_000, env: homeEnv(home) });
}

function homeEnv(home: string): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    XDG_CONFIG_HOME: path.join(home, 'config'),
    XDG_STATE_HOME: path.join(home, 'state'),
    XDG_CACHE_HOME: path.join(home, 'cache'),
    GALEO_TEST_HOME: home,
  };
}
