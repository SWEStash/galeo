import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { installAppLifecycle, type LifecycleApp } from './lifecycle';

class FakeApp extends EventEmitter implements LifecycleApp {
  quit = vi.fn();
}

describe('installAppLifecycle', () => {
  it.each(['linux', 'win32'] as const)('quits when the last window closes on %s', (platform) => {
    const app = new FakeApp();
    installAppLifecycle(app, { platform, windowCount: () => 0, openWindow: vi.fn() });
    app.emit('window-all-closed');
    expect(app.quit).toHaveBeenCalled();
  });

  it('stays alive without windows on macOS', () => {
    const app = new FakeApp();
    installAppLifecycle(app, { platform: 'darwin', windowCount: () => 0, openWindow: vi.fn() });
    app.emit('window-all-closed');
    expect(app.quit).not.toHaveBeenCalled();
  });

  it('opens a window when the macOS app is activated with none open', () => {
    const openWindow = vi.fn();
    const app = new FakeApp();
    let windows = 0;
    installAppLifecycle(app, { platform: 'darwin', windowCount: () => windows, openWindow });
    app.emit('activate');
    expect(openWindow).toHaveBeenCalledTimes(1);
    windows = 1;
    app.emit('activate');
    expect(openWindow).toHaveBeenCalledTimes(1);
  });
});
