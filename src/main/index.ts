import { app, BrowserWindow } from 'electron';
import path from 'node:path';

const devServerUrl = process.env['GALEO_DEV_SERVER_URL'];

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
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(import.meta.dirname, '../renderer/index.html'));
  }
}

void app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
