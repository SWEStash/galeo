import { useState } from 'react';
import type { SettingsNotice as Notice } from '../../shared/settings';

/** UX §4 "settings file invalid": non-modal, names the file, and says it was left as it is (SR-17). */
export function SettingsNotice({ notices }: { notices: readonly Notice[] }) {
  const [dismissed, setDismissed] = useState<readonly Notice[] | null>(null);
  if (notices.length === 0 || dismissed === notices) return null;
  return (
    <div className="notice" role="status" data-testid="settings-notice">
      {notices.map((notice) => (
        <p key={notice.path}>
          <code>{notice.path}</code> can't be used. Your file was left untouched; using the last valid settings.
        </p>
      ))}
      <button type="button" onClick={() => setDismissed(notices)}>
        Dismiss
      </button>
    </div>
  );
}

/** The profile's session file was invalid: set aside, and the newest valid snapshot restored (SR-17). */
export function SessionNotice({ notice }: { notice: Notice | null }) {
  const [dismissed, setDismissed] = useState<Notice | null>(null);
  if (!notice || dismissed === notice) return null;
  return (
    <div className="notice" role="status" data-testid="session-notice">
      <p>
        The saved session couldn't be read, so the last saved one before it was restored. The file was kept as{' '}
        <code>{notice.path}.invalid</code>.
      </p>
      <button type="button" onClick={() => setDismissed(notice)}>
        Dismiss
      </button>
    </div>
  );
}
