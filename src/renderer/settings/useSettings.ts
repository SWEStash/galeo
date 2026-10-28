import { useEffect, useState } from 'react';
import type { SettingsState } from '../../shared/contracts';
import { logFailure } from '../tabs/closed-tab';

/** The window's settings and config notices, as main resolves them; `null` until the first answer. */
export function useSettings(): SettingsState | null {
  const [state, setState] = useState<SettingsState | null>(null);
  useEffect(() => {
    let current = true;
    const stop = window.galeo.settings.onChanged(setState);
    void window.galeo.settings.get().then((first) => {
      if (current) setState((latest) => latest ?? first);
    }, logFailure('reading the settings'));
    return () => {
      current = false;
      stop();
    };
  }, []);
  return state;
}
