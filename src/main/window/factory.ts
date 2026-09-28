import { app, BrowserWindow, nativeTheme } from 'electron';
import path from 'node:path';
import type { Command } from '../../shared/keymap';
import { capabilityKey, hardenedWebPreferences, keymapPlatform, titleBarOverlay, windowTitle } from './policy';

export interface WindowOptions {
  url: string;
  sandboxed: boolean;
  /** A small fixed-size window for app-level choices, such as "sandbox unavailable". */
  dialog?: boolean;
  /** A capability key was pressed; the page never saw it (ADR-004). */
  onCapabilityKey?: (command: Command) => void;
}

/** The only place that constructs a `BrowserWindow`. Main owns the title (never the page). */
export function createAppWindow({ url, sandboxed, dialog = false, onCapabilityKey }: WindowOptions): BrowserWindow {
  const title = windowTitle('galeo', { sandboxed });
  const scheme = () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  const window = new BrowserWindow({
    title,
    ...(dialog
      ? { width: 560, height: 340, resizable: false }
      : { width: 1100, height: 800, titleBarStyle: 'hidden', titleBarOverlay: titleBarOverlay(scheme()) }),
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
  window.once('ready-to-show', () => window.show());
  void window.loadURL(url);
  return window;
}
