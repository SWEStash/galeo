import { describe, expect, it } from 'vitest';
import { capabilityKey, hardenedWebPreferences, isPermissionAllowed, ownArgs, TAB_BAR_HEIGHT, titleBarOverlay, windowTitle } from './policy';

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
  it('uses the title as is when sandboxed', () => {
    expect(windowTitle('galeo', { sandboxed: true })).toBe('galeo');
  });

  it('marks every title while unsandboxed', () => {
    expect(windowTitle('galeo', { sandboxed: false })).toBe('galeo — unsandboxed');
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
  it('isolates and sandboxes every renderer (SR-01)', () => {
    expect(hardenedWebPreferences({ preload: '/app/preload.cjs', isPackaged: true })).toEqual({
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
    });
  });

  it('allows DevTools only in unpackaged builds', () => {
    expect(hardenedWebPreferences({ preload: '/p', isPackaged: false }).devTools).toBe(true);
  });
});

describe('titleBarOverlay', () => {
  it("draws the window controls over the tab bar, in the tab bar's colours for each scheme", () => {
    expect(titleBarOverlay('light')).toEqual({ color: '#f6f8fa', symbolColor: '#1f2328', height: TAB_BAR_HEIGHT });
    expect(titleBarOverlay('dark')).toEqual({ color: '#161b22', symbolColor: '#e6edf3', height: TAB_BAR_HEIGHT });
  });
});

describe('capabilityKey', () => {
  const input = (key: string, control = true, type = 'keyDown') => ({ type, key, control, alt: false, shift: false, meta: false });

  it("names a capability key from Electron's input, on key down only", () => {
    expect(capabilityKey(input('e'), 'linux')).toBe('editMode');
    expect(capabilityKey(input('e', true, 'keyUp'), 'linux')).toBeNull();
    expect(capabilityKey(input('f'), 'linux')).toBeNull();
    expect(capabilityKey(input('e', false), 'linux')).toBeNull();
  });

  it('ignores a held key repeating: a capability is granted once per press', () => {
    expect(capabilityKey({ ...input('e'), isAutoRepeat: true }, 'linux')).toBeNull();
  });
});
