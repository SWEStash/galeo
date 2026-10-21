import { describe, expect, it } from 'vitest';
import { appIcon, hardenedWebPreferences, isPermissionAllowed, mainKey, ownArgs, TAB_BAR_HEIGHT, titleBarOverlay, windowTitle } from './policy';
import { startInfoArg, startInfoFrom } from '../../shared/start-info';

describe('isPermissionAllowed', () => {
  it('allows only sanitized clipboard writes (copy buttons)', () => {
    expect(isPermissionAllowed('clipboard-sanitized-write')).toBe(true);
  });

  it.each(['media', 'geolocation', 'notifications', 'clipboard-read', 'hid', 'serial', 'usb', 'openExternal'])(
    'denies %s',
    (permission) => {
      expect(isPermissionAllowed(permission)).toBe(false);
    },
  );
});

describe('windowTitle', () => {
  it('names the shown file and the profile before the app (UX: GNOME overview, Alt+Tab)', () => {
    expect(windowTitle(['plan.md', 'acme'], { sandboxed: true })).toBe('plan.md — acme — galeo');
  });

  it('leaves out a part that is missing, such as the file of an empty window', () => {
    expect(windowTitle([null, 'default'], { sandboxed: true })).toBe('default — galeo');
    expect(windowTitle([], { sandboxed: true })).toBe('galeo');
  });

  it('marks every title while unsandboxed', () => {
    expect(windowTitle(['a.md', 'default'], { sandboxed: false })).toBe('a.md — default — galeo — unsandboxed');
  });
});

describe('ownArgs', () => {
  it('drops the executable of a packaged app', () => {
    expect(ownArgs(['/opt/galeo/galeo-bin', '--', 'a.md'], { defaultApp: false })).toEqual(['--', 'a.md']);
  });

  it('drops the executable and app path of a development run', () => {
    expect(ownArgs(['/x/electron', '.', '--no-sandbox'], { defaultApp: true })).toEqual(['--no-sandbox']);
  });
});

describe('hardenedWebPreferences', () => {
  const startInfo = { name: 'galeo', version: '0.4.0', platform: 'linux', sandboxed: true, sandboxUnavailable: null, appImage: false } as const;

  it('isolates and sandboxes every renderer (SR-01)', () => {
    expect(hardenedWebPreferences({ preload: '/app/preload.cjs', isPackaged: true, startInfo })).toEqual({
      preload: '/app/preload.cjs',
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
      devTools: false,
      additionalArguments: [startInfoArg(startInfo)],
    });
  });

  it('hands the page its start info on the renderer command line', () => {
    expect(startInfoFrom(hardenedWebPreferences({ preload: '/p', isPackaged: true, startInfo }).additionalArguments)).toEqual(startInfo);
  });

  it('allows DevTools only in unpackaged builds', () => {
    expect(hardenedWebPreferences({ preload: '/p', isPackaged: false, startInfo }).devTools).toBe(true);
  });
});

describe('titleBarOverlay', () => {
  it("draws the window controls over the tab bar, in the tab bar's colours for each scheme", () => {
    expect(titleBarOverlay('light')).toEqual({ color: '#f6f8fa', symbolColor: '#1f2328', height: TAB_BAR_HEIGHT });
    expect(titleBarOverlay('dark')).toEqual({ color: '#161b22', symbolColor: '#e6edf3', height: TAB_BAR_HEIGHT });
  });
});

describe('mainKey', () => {
  const input = (key: string, control = true, type = 'keyDown', shift = false) => ({ type, key, control, alt: false, shift, meta: false });

  it("names a capability key from Electron's input, on key down only", () => {
    expect(mainKey(input('e'), 'linux')).toBe('editMode');
    expect(mainKey(input('e', true, 'keyUp'), 'linux')).toBeNull();
    expect(mainKey(input('f'), 'linux')).toBeNull();
    expect(mainKey(input('e', false), 'linux')).toBeNull();
  });

  it('names the window keys main handles itself, and leaves tab keys to the page', () => {
    expect(mainKey(input('n'), 'linux')).toBe('newWindow');
    expect(mainKey(input('W', true, 'keyDown', true), 'linux')).toBe('closeWindow');
    expect(mainKey(input('Q', true, 'keyDown', true), 'linux')).toBe('quit');
    expect(mainKey(input('q'), 'linux')).toBeNull();
    expect(mainKey(input('w'), 'linux')).toBeNull();
    expect(mainKey(input('T', true, 'keyDown', true), 'linux')).toBeNull();
  });

  it('ignores a held key repeating: a capability is granted once per press', () => {
    expect(mainKey({ ...input('e'), isAutoRepeat: true }, 'linux')).toBeNull();
    expect(mainKey({ ...input('n'), isAutoRepeat: true }, 'linux')).toBeNull();
  });
});

describe('appIcon', () => {
  it('is the icon shipped in resources, on Linux, once packaged', () => {
    expect(appIcon({ platform: 'linux', isPackaged: true, resourcesPath: '/opt/galeo/resources', appPath: '/x' })).toBe('/opt/galeo/resources/icon.png');
  });

  it("is the repo's icon when running from a checkout", () => {
    expect(appIcon({ platform: 'linux', isPackaged: false, resourcesPath: '/x', appPath: '/src/galeo' })).toBe('/src/galeo/packaging/icons/png/256x256.png');
  });

  it.each(['darwin', 'win32'] as const)('is left to the app bundle on %s', (platform) => {
    expect(appIcon({ platform, isPackaged: true, resourcesPath: '/r', appPath: '/a' })).toBeUndefined();
  });
});
