import { chmodSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { AppPaths } from '../../core/ports';

const APP = 'galeo';

interface Context {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  home: string;
  /** Electron's `app.getPath('appData')` (used on macOS and Windows). */
  appData: string;
}

/** An XDG base directory, or its default when unset or relative (XDG Base Directory spec). */
function xdg(value: string | undefined, fallback: string): string {
  return value && path.posix.isAbsolute(value) ? value : fallback;
}

/** Config, state and cache directories per platform (ADR-005). */
export function resolveAppPaths({ platform, env, home, appData }: Context): AppPaths {
  if (platform === 'win32') {
    const { join } = path.win32;
    const local = env['LOCALAPPDATA'] || join(home, 'AppData', 'Local');
    return { configDir: join(appData, APP), stateDir: join(appData, APP, 'State'), cacheDir: join(local, APP, 'Cache') };
  }
  const { join } = path.posix;
  if (platform === 'darwin') {
    return {
      configDir: join(appData, APP),
      stateDir: join(appData, APP, 'State'),
      cacheDir: join(home, 'Library', 'Caches', APP),
    };
  }
  return {
    configDir: join(xdg(env['XDG_CONFIG_HOME'], join(home, '.config')), APP),
    stateDir: join(xdg(env['XDG_STATE_HOME'], join(home, '.local', 'state')), APP),
    cacheDir: join(xdg(env['XDG_CACHE_HOME'], join(home, '.cache')), APP),
  };
}

/**
 * Creates the app's own folders owner-only (SR-16), before Chromium writes into them. Synchronous:
 * it runs at startup, ahead of `app.setPath`. Parents such as `~/.config` keep their modes.
 */
export function createPrivateDirs(paths: AppPaths): void {
  for (const dir of [paths.configDir, paths.stateDir, paths.cacheDir]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
  }
}
