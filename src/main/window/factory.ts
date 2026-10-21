import { app, BrowserWindow, nativeTheme, screen } from 'electron';
import type { StartInfo } from '../../shared/contracts';
import path from 'node:path';
import { visibleBounds } from '../../core/session/bounds';
import type { WindowBounds } from '../../core/session/model';
import type { Command } from '../../shared/keymap';
import { schemeFor, type ThemeMode } from '../../shared/settings';
import { appIcon, hardenedWebPreferences, keymapPlatform, mainKey, titleBarOverlay, windowTitle } from './policy';

export interface WindowOptions {
  url: string;
  sandboxed: boolean;
  /** A small fixed-size window for app-level choices, such as "sandbox unavailable". */
  dialog?: boolean;
  /** A key main handles was pressed (a capability, ADR-004, or a window key); the page never saw it. */
  onMainKey?: (command: Command) => void;
  /** The parts of the title before "galeo" (see `windowTitle`); main updates it later with `setTitle`. */
  title?: readonly (string | null)[];
  /** Where the window was last time (a restored session); the platform may place it itself. */
  bounds?: WindowBounds | null;
  /** Without `bounds`: its size, placed by the platform (a tab torn off another window, ADR-019). */
  size?: { width: number; height: number };
  /** The window's profile's theme mode, which colours its title-bar controls (see `followScheme`). */
  themeMode?: () => ThemeMode;
  /** What its page needs to paint before it can ask main anything. */
  startInfo: StartInfo;
}

/** How each window recolours its title-bar controls, which sit on the tab bar, from its own scheme. */
const schemeFollowers = new WeakMap<BrowserWindow, () => void>();

/** The window's theme mode changed: its title-bar controls follow. */
export function followScheme(window: BrowserWindow): void {
  schemeFollowers.get(window)?.();
}

/** The only place that constructs a `BrowserWindow`. Main owns the title (never the page). */
export function createAppWindow({ url, sandboxed, dialog = false, onMainKey, bounds, size, title: parts = [], themeMode, startInfo }: WindowOptions): BrowserWindow {
  const title = windowTitle(parts, { sandboxed });
  const scheme = () => schemeFor(themeMode?.() ?? 'system', nativeTheme.shouldUseDarkColors);
  // A place on a display that's gone isn't restored; the size is.
  const placed = bounds ? visibleBounds(bounds, screen.getAllDisplays().map((display) => display.workArea)) : null;
  const icon = appIcon({ platform: process.platform, isPackaged: app.isPackaged, resourcesPath: process.resourcesPath, appPath: app.getAppPath() });
  const window = new BrowserWindow({
    title,
    ...(icon ? { icon } : {}),
    ...(dialog
      ? { width: 560, height: 340, resizable: false }
      : {
          ...(placed ? { ...(placed.x === undefined ? {} : { x: placed.x, y: placed.y }), width: placed.width, height: placed.height } : (size ?? { width: 1100, height: 800 })),
          // macOS draws its own window buttons inset in the bar; the overlay is for Windows and Linux.
          ...(process.platform === 'darwin'
            ? { titleBarStyle: 'hiddenInset' as const }
            : { titleBarStyle: 'hidden' as const, titleBarOverlay: titleBarOverlay(scheme()) }),
        }),
    show: false,
    webPreferences: hardenedWebPreferences({
      preload: path.join(import.meta.dirname, '../preload/index.cjs'),
      isPackaged: app.isPackaged,
      startInfo,
    }),
  });
  window.on('page-title-updated', (event) => event.preventDefault());
  window.webContents.on('before-input-event', (event, input) => {
    const command = mainKey(input, keymapPlatform(process.platform));
    if (!command) return;
    event.preventDefault();
    onMainKey?.(command);
  });
  if (!dialog && process.platform !== 'darwin') {
    const recolour = () => window.setTitleBarOverlay(titleBarOverlay(scheme()));
    nativeTheme.on('updated', recolour);
    window.on('closed', () => nativeTheme.off('updated', recolour));
    schemeFollowers.set(window, recolour);
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
