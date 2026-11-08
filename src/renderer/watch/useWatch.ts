import { useEffect, useState } from 'react';
import type { WatchState } from '../../shared/watch';
import { logFailure } from '../tabs/closed-tab';

/** The window's watched folder as main last sent it (ADR-034); null while it watches none. */
export function useWatch(): WatchState | null {
  const [state, setState] = useState<WatchState | null>(null);
  useEffect(() => {
    let live = true;
    const stop = window.galeo.watch.onChanged(setState);
    // A reloaded page asks; an update that arrived meanwhile is newer.
    void window.galeo.watch.state().then((current) => {
      if (live) setState((latest) => latest ?? current);
    }, logFailure('reading the watched folder'));
    return () => {
      live = false;
      stop();
    };
  }, []);
  return state;
}

/** The entries not opened yet: the title-bar button's count. */
export const unopenedCount = (state: WatchState | null): number => state?.entries.filter((entry) => !entry.opened).length ?? 0;
