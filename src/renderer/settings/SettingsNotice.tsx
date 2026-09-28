import { useState } from 'react';
import type { SettingsNotice as Notice } from '../../shared/settings';

/** UX §4 "settings file invalid": non-modal, names the file, and says it was left as it is (SR-17). */
export function SettingsNotice({ notices }: { notices: readonly Notice[] }) {
  const [dismissed, setDismissed] = useState<readonly Notice[] | null>(null);
  if (notices.length === 0 || dismissed === notices) return null;
  return (
    <div className="settings-notice" role="status" data-testid="settings-notice">
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
