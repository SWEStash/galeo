import { useEffect, useState } from 'react';
import type { SettingsNotice as Notice } from '../../shared/settings';

/** UX §4 "settings file invalid": non-modal, names the file, and says it was left as it is (SR-17). */
export function SettingsNotice({ notices }: { notices: readonly Notice[] }) {
  // Main re-sends the notices with every settings change: equal ones stay dismissed.
  const [dismissed, setDismissed] = useState<string | null>(null);
  // Once the files are fixed, the same problem coming back is new again.
  useEffect(() => {
    if (notices.length === 0) setDismissed(null);
  }, [notices.length]);
  if (notices.length === 0 || dismissed === JSON.stringify(notices)) return null;
  return (
    <div className="notice" role="status" data-testid="settings-notice">
      {notices.map((notice, index) => (
        <p key={notice.path}>
          <code>{notice.path}</code> can't be used. Your file was left untouched; using the last valid settings.{' '}
          <button type="button" onClick={() => void window.galeo.settings.openNoticeFile(index)}>
            Open file
          </button>
        </p>
      ))}
      <button type="button" onClick={() => setDismissed(JSON.stringify(notices))}>
        Dismiss
      </button>
    </div>
  );
}

/** The profile's session file was invalid: set aside, and the newest valid snapshot restored (SR-17). */
export function SessionNotice({ notice }: { notice: Notice | null }) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!notice || dismissed === JSON.stringify(notice)) return null;
  return (
    <div className="notice" role="status" data-testid="session-notice">
      <p>
        The saved session couldn't be read, so the last saved one before it was restored. The file was kept as{' '}
        <code>{notice.path}.invalid</code>.
      </p>
      <button type="button" onClick={() => setDismissed(JSON.stringify(notice))}>
        Dismiss
      </button>
    </div>
  );
}
