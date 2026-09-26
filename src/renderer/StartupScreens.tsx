import { useEffect, useRef } from 'react';
import type { SandboxCause, SandboxChoice } from '../shared/contracts';

export function UnsandboxedBadge() {
  return (
    <span
      data-testid="unsandboxed-badge"
      className="unsandboxed-badge"
      title="galeo is running without Chromium's sandbox, so a malicious document could act with your user's full permissions. To go back, restart without --no-sandbox, or install the .deb package."
    >
      <span aria-hidden="true">⚠ </span>Unsandboxed
    </span>
  );
}

const CAUSES: Record<SandboxCause, { cause: string; fix: string }> = {
  'apparmor-userns': {
    cause:
      'This system restricts the user namespaces the sandbox needs. Ubuntu 24.04 and later do this for apps without an AppArmor profile, such as the AppImage.',
    fix: 'Install the .deb package, which includes the profile the sandbox needs.',
  },
  'suid-helper': {
    cause: "The sandbox helper (chrome-sandbox) isn't installed as setuid root.",
    fix: 'Install the .deb package, or reinstall galeo.',
  },
  unknown: {
    cause: 'Chromium reported that its sandbox is unavailable on this system.',
    fix: 'Install the .deb package.',
  },
};

export function SandboxUnavailable({
  cause,
  onChoose,
}: {
  cause: SandboxCause;
  onChoose: (choice: SandboxChoice) => void;
}) {
  const quit = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    quit.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onChoose('quit');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onChoose]);

  const text = CAUSES[cause];
  return (
    <main className="sandbox-unavailable" aria-labelledby="sandbox-unavailable-title">
      <h1 id="sandbox-unavailable-title">galeo can't start its security sandbox</h1>
      <p>{text.cause}</p>
      <p>{text.fix}</p>
      <p>
        Without the sandbox, a malicious document could act with your user's full permissions. Running
        without it applies to this launch only.
      </p>
      <div className="actions">
        <button ref={quit} type="button" onClick={() => onChoose('quit')}>
          Quit
        </button>
        <button type="button" onClick={() => onChoose('run-unsandboxed')}>
          Run without sandbox
        </button>
      </div>
    </main>
  );
}
