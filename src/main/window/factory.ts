import { app, BrowserWindow, nativeTheme, screen } from 'electron';
import path from 'node:path';
import { visibleBounds } from '../../core/session/bounds';
import type { WindowBounds } from '../../core/session/model';
import type { Command } from '../../shared/keymap';
import { capabilityKey, hardenedWebPreferences, keymapPlatform, titleBarOverlay, windowTitle } from './policy';

export interface WindowOptions {
  url: string;
  sandboxed: boolean;
  /** A small fixed-size window for app-level choices, such as "sandbox unavailable". */
  dialog?: boolean;
  /** A capability key was pressed; the page never saw it (ADR-004). */
  onCapabilityKey?: (command: Command) => void;
  /** Where the window was last time (a restored session); the platform may place it itself. */
  bounds?: WindowBounds | null;
}

/** The only place that constructs a `BrowserWindow`. Main owns the title (never the page). */
export function createAppWindow({ url, sandboxed, dialog = false, onCapabilityKey, bounds }: WindowOptions): BrowserWindow {
  const title = windowTitle('galeo', { sandboxed });
  const scheme = () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  // A place on a display that's gone isn't restored; the size is.
  const placed = bounds ? visibleBounds(bounds, screen.getAllDisplays().map((display) => display.workArea)) : null;
  const window = new BrowserWindow({
    title,
    ...(dialog
      ? { width: 560, height: 340, resizable: false }
      : {
          ...(placed ? { ...(placed.x === undefined ? {} : { x: placed.x, y: placed.y }), width: placed.width, height: placed.height } : { width: 1100, height: 800 }),
          titleBarStyle: 'hidden',
          titleBarOverlay: titleBarOverlay(scheme()),
        }),
    show: false,
    webPreferences: hardenedWebPreferences({
      preload: path.join(import.meta.dirname, '../preload/index.cjs'),
      isPackaged: app.isPackaged,
    }),
  });
  window.on('page-title-updated', (event) => event.preventDefault());
  window.webContents.on('before-input-event', (event, input) => {
    const command = capabilityKey(input, keymapPlatform(process.platform));
    if (!command) return;
    event.preventDefault();
    onCapabilityKey?.(command);
  });
  if (!dialog) {
    const followScheme = () => window.setTitleBarOverlay(titleBarOverlay(scheme()));
    nativeTheme.on('updated', followScheme);
    window.on('closed', () => nativeTheme.off('updated', followScheme));
  }
  window.once('ready-to-show', () => {
    if (bounds?.maximized) window.maximize();
    window.show();
  });
  void window.loadURL(url);
  return window;
}

/** Where a window is, for the session: its size and place when not maximized, and whether it is. */
export function windowBounds(window: BrowserWindow): WindowBounds {
  const { x, y, width, height } = window.getNormalBounds();
  return { x, y, width, height, maximized: window.isMaximized() };
}
