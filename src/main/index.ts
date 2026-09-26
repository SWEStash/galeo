import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { rendererEntry } from './renderer-entry';

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.once('ready-to-show', () => window.show());
  const entry = rendererEntry({ isPackaged: app.isPackaged, env: process.env });
  if ('url' in entry) {
    void window.loadURL(entry.url);
  } else {
    void window.loadFile(path.join(import.meta.dirname, '..', entry.file));
  }
}

void app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
