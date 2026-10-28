import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { loadNotices, type Notices } from './notices';
import { useLoaded } from '../useLoaded';
import { logFailure } from '../tabs/closed-tab';

/** galeo's version and licence, and the notices of what it ships (docs/dependencies.md). */
export function AboutDialog({ version, onClose }: { version: string; onClose: () => void }) {
  const [notices] = useLoaded<Notices | null>(loadNotices, null, (error) => {
    logFailure('loading the notices')(error);
    return null;
  });

  return (
    <ModalOverlay className="modal-overlay" isOpen isDismissable onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Modal className="modal about">
        <Dialog className="dialog" data-testid="about">
          <Heading slot="title">galeo {version}</Heading>
          <p>A desktop app to read and edit Markdown, text, logs, JSON, CSV and source code. Free software under the MIT licence.</p>
          <h3>Third-party notices</h3>
          <p>
            galeo is built on Electron and Chromium. Chromium&apos;s licences ship with it, in <code>LICENSES.chromium.html</code> in
            galeo&apos;s install folder.
          </p>
          <div className="about-notices" data-testid="about-notices">
            {notices ? (
              <>
                <details>
                  <summary>Electron · MIT</summary>
                  <pre>{notices.electron}</pre>
                </details>
                {notices.fonts.map((font) => (
                  <details key={font.name}>
                    <summary>{font.name} (font) · OFL-1.1</summary>
                    <pre>{font.text}</pre>
                  </details>
                ))}
                {notices.packages.map((group) => (
                  <details key={group.packages.map((each) => `${each.name}@${each.version}`).join(' ')}>
                    <summary>
                      {group.packages.map((each) => `${each.name} ${each.version}`).join(', ')} · {group.packages[0]!.license}
                    </summary>
                    <pre>{group.texts.join('\n\n')}</pre>
                  </details>
                ))}
              </>
            ) : (
              <p role="status">Loading notices…</p>
            )}
          </div>
          <div className="dialog-buttons">
            <Button onPress={onClose}>Close</Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
