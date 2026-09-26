import { app, session } from 'electron';
import { isPermissionAllowed } from '../window/policy';

/**
 * App-wide renderer lockdown (SR-01), installed before the first window: pages never navigate or
 * open windows (in-tab navigation is app state), never attach a webview, get no permission except
 * sanitized clipboard writes, and WebRTC never uses non-proxied UDP (SR-06).
 */
export function hardenWebContents(): void {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(isPermissionAllowed(permission)),
  );
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => isPermissionAllowed(permission));

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event) => event.preventDefault());
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  });
}
