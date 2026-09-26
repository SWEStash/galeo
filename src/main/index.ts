import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { registerIpc } from './ipc/register';
import { registerAppProtocol, registerSchemes } from './protocol/register';
import { rendererUrl, trustedOrigins } from './renderer-entry';

const runtime = { isPackaged: app.isPackaged, env: process.env };

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
  void window.loadURL(rendererUrl(runtime));
}

registerSchemes();

void app.whenReady().then(() => {
  registerAppProtocol(path.join(import.meta.dirname, '../renderer'));
  registerIpc(trustedOrigins(runtime));
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
