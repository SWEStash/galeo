import { describe, expect, it } from 'vitest';
import { resolveAppPaths } from './app-paths';

describe('resolveAppPaths', () => {
  it('uses the XDG base directories on Linux', () => {
    const env = { XDG_CONFIG_HOME: '/x/config', XDG_STATE_HOME: '/x/state', XDG_CACHE_HOME: '/x/cache' };
    expect(resolveAppPaths({ platform: 'linux', env, home: '/home/u', appData: '' })).toEqual({
      configDir: '/x/config/galeo',
      stateDir: '/x/state/galeo',
      cacheDir: '/x/cache/galeo',
    });
  });

  it('falls back to the XDG defaults, ignoring relative or empty values (XDG spec)', () => {
    const env = { XDG_CONFIG_HOME: 'relative/config', XDG_STATE_HOME: '' };
    expect(resolveAppPaths({ platform: 'linux', env, home: '/home/u', appData: '' })).toEqual({
      configDir: '/home/u/.config/galeo',
      stateDir: '/home/u/.local/state/galeo',
      cacheDir: '/home/u/.cache/galeo',
    });
  });

  it('uses Application Support and Caches on macOS', () => {
    expect(
      resolveAppPaths({ platform: 'darwin', env: {}, home: '/Users/u', appData: '/Users/u/Library/Application Support' }),
    ).toEqual({
      configDir: '/Users/u/Library/Application Support/galeo',
      stateDir: '/Users/u/Library/Application Support/galeo/State',
      cacheDir: '/Users/u/Library/Caches/galeo',
    });
  });

  it('uses APPDATA and LOCALAPPDATA on Windows', () => {
    const env = { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' };
    expect(
      resolveAppPaths({ platform: 'win32', env, home: 'C:\\Users\\u', appData: 'C:\\Users\\u\\AppData\\Roaming' }),
    ).toEqual({
      configDir: 'C:\\Users\\u\\AppData\\Roaming\\galeo',
      stateDir: 'C:\\Users\\u\\AppData\\Roaming\\galeo\\State',
      cacheDir: 'C:\\Users\\u\\AppData\\Local\\galeo\\Cache',
    });
  });
});
