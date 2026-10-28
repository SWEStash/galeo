import { useEffect } from 'react';
import { fileName } from '../../shared/paths';
import { useConfirmUnsaved } from '../edit/UnsavedPrompt';
import type { TabStore } from '../tabs/store';
import { logFailure } from '../tabs/closed-tab';

/**
 * Unsaved changes (ADR-013): closing a dirty tab asks first, and so does main before it closes the
 * window, quits or deletes the profile, one dirty tab at a time, showing each.
 */
export function useUnsavedGuards(store: TabStore) {
  const confirm = useConfirmUnsaved();
  useEffect(() => {
    const nameOf = (id: string) => {
      const tab = store.getSnapshot().tabs.find((each) => each.id === id);
      return tab ? fileName(tab.path) : 'this file';
    };
    const ask = (id: string) => confirm(id, nameOf(id));
    store.setCloseGuard(ask);
    const stop = window.galeo.documents.onConfirmClose((ids) => {
      const failed = logFailure('the answer to closing');
      void window.galeo.documents.closeAnswer('asking').catch(failed);
      void (async () => {
        for (const id of ids) {
          store.activate(id);
          if (!(await ask(id))) return window.galeo.documents.closeAnswer('cancel');
        }
        await window.galeo.documents.closeAnswer('proceed');
      })().catch(failed);
    });
    return () => {
      stop();
      store.setCloseGuard(null);
    };
  }, [store, confirm]);
}
