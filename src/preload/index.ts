// The only bridge between main and the renderer: `window.galeo` has one fixed method per
// channel and event of the shared contract, and never exposes `ipcRenderer` or a generic invoke (SR-11).
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { buildApi } from '../shared/contracts';
import type { PreloadChannel } from '../shared/contracts';
import { listenForDrops } from './drops';
import { subscriber } from './events';

contextBridge.exposeInMainWorld(
  'galeo',
  buildApi((channel, args) => ipcRenderer.invoke(channel, ...args), subscriber(ipcRenderer)),
);

// Dropped files reach main from here only; the page hears of them as a token (SR-12).
const register: PreloadChannel = 'drops.register';
listenForDrops(window, {
  pathFor: (file) => webUtils.getPathForFile(file),
  register: (paths) => void ipcRenderer.invoke(register, paths).catch(() => {}),
});
