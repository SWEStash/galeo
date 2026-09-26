# ADR-009 — Sandbox unavailable: a retry-on-crash launcher wrapper shows the error window

- Status: Accepted (2026-09-26)
- Date: 2026-09-26
- Deciders: project owner
- Supersedes: one clause of [ADR-008](ADR-008-packaging-and-distribution.md) "Sandbox": *nothing
  galeo ships passes `--no-sandbox`*. The rest of ADR-008's sandbox policy stands.
- Related: [ADR-004](ADR-004-security-and-zero-network.md), [Threat model](../security/threat-model.md)
  (SR-01, SR-13, T17), [UX](../design/ux.md) ("Sandbox unavailable" and "Running unsandboxed" states)

## Context

ADR-008 says that when Chromium's sandbox is unavailable (for example the AppImage on Ubuntu
24.04+, where AppArmor restricts unprivileged user namespaces), galeo shows a window. That
window names the cause and the fix, and offers **Quit** (default) or "Run without sandbox" for
that launch only.

We checked how Electron 44 fails in that situation. The browser process aborts while starting
the zygote. The log shows `FATAL: setuid_sandbox_host.cc … The SUID sandbox helper binary was
found, but is not configured correctly`, the process gets SIGTRAP (exit status 133) and dumps
core. This happens **before any of the app's JavaScript runs**, so the main process cannot
detect the failure or show a window itself.

Only a process outside the Electron binary can notice the failure and start a launch that can
show the window. A launch that gets as far as our JavaScript needs `--no-sandbox`. That
conflicts with ADR-008's rule that nothing galeo ships passes the flag.

## Decision

On Linux, a small POSIX shell **wrapper** sits in front of the Electron binary. The packaging
step renames the binary to `galeo-bin` and installs the wrapper as `galeo`, so the
`.desktop` entry, `/usr/bin/gal` and the AppImage entry point all go through it.

1. The wrapper starts `galeo-bin` with the user's arguments, **unchanged and sandboxed**. It
   waits for the process and forwards termination signals to it.
2. If the process dies from the abort **and** its stderr contains Chromium's sandbox FATAL
   marker, the wrapper relaunches once. The relaunch runs `galeo-bin --no-sandbox
   --galeo-sandbox-unavailable=<cause> <original arguments>`. `<cause>` is the detected reason:
   `apparmor-userns` (the AppArmor user-namespace restriction) or `suid-helper` (a helper that
   isn't setuid root). Main treats any other value as `unknown` and still shows the window. In every other case
   the wrapper exits with the child's status and changes nothing.
3. Main honours `--galeo-sandbox-unavailable` only when all of these hold:
   - it is the first launch;
   - `--no-sandbox` is present too;
   - it holds the single-instance lock.

   A relaunch that finds a running instance forwards its files there as usual and exits. The
   running instance ignores both flags.
4. In that mode main shows **only** the "sandbox unavailable" window, and opens no documents,
   argv files or session. The window is an app page with no document content.
   - **Quit** (the default) exits.
   - "Run without sandbox" continues startup in the same process. That process was already
     unsandboxed, so there is no second relaunch. Every window then shows the persistent
     "Unsandboxed" warning (ADR-008).
5. Nothing is persisted. The next launch tries the sandbox again.

macOS and Windows get no wrapper: Chromium's sandbox has no equivalent startup failure there.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Retry-on-crash wrapper** | Reacts to the real failure, so it never falsely reports the sandbox as unavailable (ADR-008's named risk); the sandboxed path is unchanged; no new dependency | Passes `--no-sandbox` without the user asking (the error window runs unsandboxed, with no user content); where the sandbox is broken, each launch pays for one aborted start (fast, but it dumps core); the wrapper stays as the app's parent process | **Chosen** |
| Predictive probe wrapper | No aborted start | Guesses from kernel settings, `unshare -U` and helper permissions, so it can misfire on distributions or kernels we haven't seen; still passes `--no-sandbox` | Rejected |
| No in-app window (the wrapper prints or notifies the fix and exits) | Keeps ADR-008 literal | Drops the "Run without sandbox" choice the owner wanted; a double-click shows nothing useful without a notifier | Rejected |

## Consequences

### Positive
- The UX states in `docs/design/ux.md` work as specified, including for a double-click on the
  AppImage.
- Where the sandbox works (the `.deb`, most distributions), behaviour is identical to launching
  the binary directly.

### Negative
- The "sandbox unavailable" window itself runs unsandboxed. It loads only app assets under the
  CSP and network guard, and no document content until the user chooses.
- A wrapper passes `--no-sandbox` on the user's behalf, but only after a real sandbox failure,
  and only to show the choice.
- Where the sandbox is unavailable, each launch costs an aborted start and a core dump.

- The `.deb`'s AppArmor `userns` profile must name `galeo-bin`, not the wrapper. The packaging
  step checks this.

### Risks
- **The FATAL marker text changes in a Chromium release.** Then the wrapper passes the abort
  through and the user sees no window, which is the safe side of the failure. Mitigation: a CI
  test runs the wrapper against a stub binary that reproduces the marker. The release checklist
  covers the AppImage on Ubuntu 24.04.
- **Someone passes `--galeo-sandbox-unavailable` by hand.** They get the error window, and only
  together with `--no-sandbox`, which they could already pass. No extra capability.

## Revisit triggers
- Electron gains a supported way to fall back or report sandbox failure to the main process.
- The AppImage is dropped, or it becomes able to run sandboxed on Ubuntu.
