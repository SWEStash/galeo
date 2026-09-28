import type { Subscribe } from '../shared/contracts/api';

/** The part of `ipcRenderer` subscriptions need. */
export interface IpcListeners {
  on(channel: string, listener: (event: unknown, payload: unknown) => void): unknown;
  off(channel: string, listener: (event: unknown, payload: unknown) => void): unknown;
}

/**
 * Subscriptions for `window.galeo`'s `on…` methods. The page gets the payload only: Electron's
 * event object carries the sender, which would hand the page `ipcRenderer` (SR-11).
 */
export function subscriber(ipc: IpcListeners): Subscribe {
  return (event, listener) => {
    const forward = (_event: unknown, payload: unknown) => (listener as (payload: unknown) => void)(payload);
    ipc.on(event, forward);
    return () => {
      ipc.off(event, forward);
    };
  };
}
