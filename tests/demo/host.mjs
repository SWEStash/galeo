// Electron as a plain browser for the website demo's tests (#41): one sandboxed window on GALEO_DEMO_URL, and
// every request any page of it makes, for the test to read (globalThis.__demoRequests).
import { app, BrowserWindow, session } from 'electron';

globalThis.__demoRequests = [];
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    globalThis.__demoRequests.push(details.url);
    callback({});
  });
  const window = new BrowserWindow({ width: 1200, height: 800, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  void window.loadURL(process.env.GALEO_DEMO_URL);
});
