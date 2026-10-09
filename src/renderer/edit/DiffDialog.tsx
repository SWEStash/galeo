import { useEffect, useRef } from 'react';
import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import type { SourceLanguage } from '../document/source-view';

/**
 * Show diff (UX F12): mine | theirs, read-only, with the bar's two choices. Esc or Close goes back
 * to the bar; either choice closes it too.
 */
export function DiffDialog({
  mine,
  theirs,
  language,
  onKeepMine,
  onLoadTheirs,
  onClose,
}: {
  mine: string;
  theirs: string;
  language: SourceLanguage;
  onKeepMine: () => void;
  onLoadTheirs: () => void;
  onClose: () => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let view: { destroy(): void } | null = null;
    let current = true;
    void import('./diff-view').then(({ createDiffView }) => {
      if (current && holder.current) view = createDiffView({ parent: holder.current, mine, theirs, language });
    });
    return () => {
      current = false;
      view?.destroy();
    };
  }, [mine, theirs, language]);

  return (
    <ModalOverlay className="modal-overlay" isOpen isDismissable onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Modal className="modal diff-view">
        <Dialog className="dialog diff-view-dialog" aria-label="Changes: mine | theirs" data-testid="diff-dialog">
          <div className="diff-view-bar">
            <Heading slot="title" className="diff-view-title">
              Changes
            </Heading>
            <Button onPress={onClose}>Close</Button>
          </div>
          <div className="diff-view-sides" aria-hidden="true">
            <span>Mine (unsaved)</span>
            <span>Theirs (on disk)</span>
          </div>
          <div ref={holder} className="diff-view-body" />
          <div className="diff-view-actions">
            <Button onPress={onKeepMine}>Keep mine</Button>
            <Button onPress={onLoadTheirs}>Load theirs</Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
