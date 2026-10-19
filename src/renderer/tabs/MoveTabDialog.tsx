import { useEffect, useState } from 'react';
import { Button, Dialog, Heading, ListBox, ListBoxItem, Modal, ModalOverlay } from 'react-aria-components';
import { accentOf } from '../../shared/accents';
import type { OtherWindow } from '../../shared/contracts';

/**
 * "Move tab to window…" (UX F15): the other windows, by profile (with its colour) and the file each
 * shows. Choosing one moves the shown tab there; main checks the window is still one of galeo's.
 */
export function MoveTabDialog({ onChoose, onClose }: { onChoose: (window: number) => void; onClose: () => void }) {
  const [windows, setWindows] = useState<OtherWindow[] | null>(null);
  useEffect(() => {
    let current = true;
    void window.galeo.tabs
      .windows()
      .then((found) => current && setWindows(found))
      .catch(() => current && setWindows([]));
    return () => {
      current = false;
    };
  }, []);

  return (
    <ModalOverlay className="modal-overlay" isOpen isDismissable onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Modal className="modal move-tab">
        <Dialog className="dialog" data-testid="move-tab">
          <Heading slot="title">Move tab to window</Heading>
          {windows === null ? (
            <p role="status">Looking for windows…</p>
          ) : windows.length === 0 ? (
            <p>No other windows are open.</p>
          ) : (
            <ListBox
              aria-label="Windows"
              className="move-tab-list"
              autoFocus="first"
              items={windows.map((each) => ({ ...each, id: each.window }))}
              onAction={(key) => onChoose(Number(key))}
            >
              {(each) => (
                <ListBoxItem id={each.window} textValue={`${each.profile} ${each.shows ?? 'No tabs'}`} className="menu-item">
                  <span className="profile-chip-swatch" aria-hidden="true" style={{ background: accentOf(each.accent) }} />
                  <span className="menu-label">
                    {each.profile} <span className="menu-description">{each.shows ?? 'No tabs'}</span>
                  </span>
                </ListBoxItem>
              )}
            </ListBox>
          )}
          <div className="dialog-buttons">
            <Button onPress={onClose}>Cancel</Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
