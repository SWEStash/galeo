// Electron as a plain browser for the website demo's tests (#41, #65): one sandboxed window on GALEO_DEMO_URL, and
// every request any page of it makes, for the test to read (globalThis.__demoRequests). Optional:
// GALEO_DEMO_SIZE (`<width>x<height>`) and GALEO_DEMO_NO_SCRIPT=1.
import { app, BrowserWindow, session } from 'electron';

globalThis.__demoRequests = [];
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    globalThis.__demoRequests.push(details.url);
    callback({});
  });
  const [width, height] = (process.env.GALEO_DEMO_SIZE ?? '1200x800').split('x').map(Number);
  const javascript = process.env.GALEO_DEMO_NO_SCRIPT !== '1';
  const window = new BrowserWindow({ width, height, useContentSize: Boolean(process.env.GALEO_DEMO_SIZE), webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript } });
  void window.loadURL(process.env.GALEO_DEMO_URL);
});
