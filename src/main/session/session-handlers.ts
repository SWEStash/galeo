import type { WindowBounds } from '../../core/session/model';
import type { SessionStore } from '../../core/session/store';
import type { TabRegistry, WindowState } from '../../core/tabs/registry';
import type { Handlers } from '../ipc/register';

type SessionChannels = 'session.previous' | 'session.restorePrevious';

interface SessionProfile {
  sessions: Pick<SessionStore, 'previous' | 'readPrevious'>;
}

/**
 * Earlier sessions of the sender's profile (UX F5), by snapshot number. One restore runs at a
 * time: the asking window, if empty, takes the first window's tabs; the others open new windows.
 */
export function sessionHandlers<P extends SessionProfile>(deps: {
  profileOf: (window: number) => P | undefined;
  /** False while the app is still asking about the sandbox. */
  ready: () => boolean;
  tabs: Pick<TabRegistry, 'list' | 'restoreWindow'>;
  openWindow: (profile: P, window: { bounds: WindowBounds | null; state: WindowState }) => void;
}): Pick<Handlers, SessionChannels> {
  const { profileOf, ready, tabs, openWindow } = deps;
  let restoring = false;
  return {
    'session.previous': (_args, event) => profileOf(event.sender.id)?.sessions.previous() ?? [],
    'session.restorePrevious': async ([snapshot], event) => {
      const profile = profileOf(event.sender.id);
      if (!ready() || restoring || !profile) throw new Error('not now');
      restoring = true;
      try {
        const previous = await profile.sessions.readPrevious(snapshot);
        if (!previous) throw new Error('no such session');
        const [first, ...rest] = previous.windows;
        if (first && tabs.list(event.sender.id).length === 0) tabs.restoreWindow(event.sender.id, first);
        else if (first) rest.unshift(first);
        for (const window of rest) openWindow(profile, { bounds: window.bounds, state: window });
      } finally {
        restoring = false;
      }
    },
  };
}
