import { app, session } from 'electron';
import { isRequestAllowed, type NetworkPolicy } from './network-policy';

/** Chromium switches that must be set before `app` is ready. */
export function disableBackgroundNetworking(): void {
  app.commandLine.appendSwitch('dns-prefetch-disable');
}

/**
 * Cancels every request outside the policy in the default session, which also covers WebSocket
 * (SR-06). Install it before the first window. `onBlocked` sees each cancelled URL.
 */
export function installNetworkGuard(policy: NetworkPolicy, onBlocked: (url: string) => void): void {
  const ses = session.defaultSession;
  ses.webRequest.onBeforeRequest((details, callback) => {
    const allowed = isRequestAllowed(details.url, policy);
    if (!allowed) onBlocked(details.url);
    callback({ cancel: !allowed });
  });
  ses.setSpellCheckerEnabled(false);
}
