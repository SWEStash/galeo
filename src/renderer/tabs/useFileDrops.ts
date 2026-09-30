import { useEffect, useRef } from 'react';
import type { DropTarget } from '../../shared/contracts';
import { ignoreClosedTab } from './closed-tab';

/**
 * Files dropped from the file manager (UX F3). The page never sees their paths: main tells it a
 * drop arrived, and the page says where it landed, the caret or the document area (after the
 * shown tab). A dropped folder opens quick open on it.
 */
export function useFileDrops(openQuickOpen: () => void): { landed: (target: DropTarget) => void } {
  // Where the last drop landed, as the page's own drop handler saw it; main's token comes after.
  const target = useRef<DropTarget | null>(null);
  useEffect(
    () =>
      window.galeo.drops.onReceived(({ token }) => {
        const where = target.current ?? {};
        target.current = null;
        void window.galeo.drops.open(token, where).then(({ folder }) => folder && openQuickOpen(), ignoreClosedTab);
      }),
    [openQuickOpen],
  );
  return { landed: (where) => void (target.current = where) };
}
