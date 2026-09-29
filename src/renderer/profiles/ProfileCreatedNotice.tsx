import { useEffect, useState } from 'react';

/**
 * "Created profile 'X' · Undo" (ADR-005): shown in the window of a profile `--profile` just
 * created, so a typo doesn't leave a stray profile. Undo sends the files where they would have gone.
 */
export function ProfileCreatedNotice() {
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null);

  useEffect(() => {
    let current = true;
    void window.galeo.profiles.created().then((notice) => current && setCreated(notice));
    return () => {
      current = false;
    };
  }, []);

  if (!created) return null;
  return (
    <div className="notice" role="status" data-testid="profile-created">
      <p>Created profile '{created.name}'</p>
      <button
        type="button"
        onClick={() => {
          setCreated(null);
          void window.galeo.profiles.undoCreate(created.token);
        }}
      >
        Undo
      </button>
      <button type="button" onClick={() => setCreated(null)}>
        Dismiss
      </button>
    </div>
  );
}
