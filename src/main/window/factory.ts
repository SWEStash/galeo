import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { hardenedWebPreferences, windowTitle } from './policy';

export interface WindowOptions {
  url: string;
  sandboxed: boolean;
  /** A small fixed-size window for app-level choices, such as "sandbox unavailable". */
  dialog?: boolean;
}

/** The only place that constructs a `BrowserWindow`. Main owns the title (never the page). */
export function createAppWindow({ url, sandboxed, dialog = false }: WindowOptions): BrowserWindow {
  const title = windowTitle('galeo', { sandboxed });
  const window = new BrowserWindow({
    title,
    ...(dialog ? { width: 560, height: 340, resizable: false } : { width: 1100, height: 800 }),
    show: false,
    webPreferences: hardenedWebPreferences({
      preload: path.join(import.meta.dirname, '../preload/index.cjs'),
      isPackaged: app.isPackaged,
    }),
  });
  window.on('page-title-updated', (event) => event.preventDefault());
  window.once('ready-to-show', () => window.show());
  void window.loadURL(url);
  return window;
}
