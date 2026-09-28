// The only bridge between main and the renderer: `window.galeo` has one fixed method per
// channel and event of the shared contract, and never exposes `ipcRenderer` or a generic invoke (SR-11).
import { contextBridge, ipcRenderer } from 'electron';
import { buildApi } from '../shared/contracts';
import { subscriber } from './events';

contextBridge.exposeInMainWorld(
  'galeo',
  buildApi((channel, args) => ipcRenderer.invoke(channel, ...args), subscriber(ipcRenderer)),
);
