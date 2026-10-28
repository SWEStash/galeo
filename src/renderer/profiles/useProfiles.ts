import { useEffect, useState } from 'react';
import type { ProfilesState } from '../../shared/contracts';
import { logFailure } from '../tabs/closed-tab';

/** The profiles and the window's own, as main knows them; `null` until the first answer. */
export function useProfiles(): ProfilesState | null {
  const [state, setState] = useState<ProfilesState | null>(null);
  useEffect(() => {
    let current = true;
    const stop = window.galeo.profiles.onChanged(setState);
    void window.galeo.profiles.list().then((first) => {
      if (current) setState((latest) => latest ?? first);
    }, logFailure('reading the profiles'));
    return () => {
      current = false;
      stop();
    };
  }, []);
  return state;
}
