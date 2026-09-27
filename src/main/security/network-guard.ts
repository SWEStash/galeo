import { app, session } from 'electron';
import { isRequestAllowed, type NetworkPolicy } from './network-policy';

/**
 * Network lockdown that must be in place before `app` is ready.
 *
 * - With `resolverRules`, no host resolves, so the network stack can't connect anywhere.
 * - A new session sets its spell-check languages from the system locale and downloads each
 *   missing Hunspell dictionary from Google through a browser-internal loader that `webRequest`
 *   never sees, so every session starts with no languages, spell-check off, and the download
 *   base pointed at the app's own protocol.
 * - Blink's DNS prefetching (`<link rel=dns-prefetch>`, which the CSP doesn't cover) is off.
 */
export function lockDownBackgroundNetworking(resolverRules: string | null): void {
  if (resolverRules) app.commandLine.appendSwitch('host-resolver-rules', resolverRules);
  app.commandLine.appendSwitch('dns-prefetch-disable');
  app.commandLine.appendSwitch('blink-settings', 'dnsPrefetchingEnabled=false');
  app.on('session-created', (created) => {
    created.setSpellCheckerLanguages([]);
    created.setSpellCheckerEnabled(false);
    created.setSpellCheckerDictionaryDownloadURL('galeo://app/no-dictionaries/');
  });
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
}
