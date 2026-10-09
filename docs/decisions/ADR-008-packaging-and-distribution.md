# ADR-008 — Build & packaging: Vite 8 + electron-builder; .deb official, AppImage and macOS/Windows previews secondary; GitHub Releases; no auto-update

- Status: Accepted (2026-09-26, with review amendments; amended 2026-09-26: opt-in unsandboxed
  mode, see "Sandbox"; one clause superseded by [ADR-009](ADR-009-sandbox-unavailable-launcher.md);
  amended 2026-10-09: the MDX file type moves to v0.3, see "Desktop entry")
- Date: 2026-09-25
- Deciders: project owner
- Related: [ADR-001](ADR-001-app-shell-stack.md), [ADR-004](ADR-004-security-and-zero-network.md),
  [Threat model](../security/threat-model.md) (SR-08, SR-09, SR-10, SR-13), [PRD](../PRD.md)
  (platform constraints; Open Question on Flatpak)

## Context

The PRD targets Ubuntu 24.04 (x86_64) as the official platform, with the code portable to macOS
and Windows from the start (owner decision 2026-09-25), and `.deb` and AppImage packages, `galeo` on `PATH`, a
`.desktop` entry with MIME associations (so double-click and "Open With" from the Files app
work), and no network use (so no auto-updater). The threat model requires Electron Fuses,
verified in the packaged binary; releases built only in CI with checksums and provenance; and a
fast path for Electron security updates.

The sibling projects use semantic-release on `main` with Conventional Commits.

## Decision

- **Build**: **plain Vite 8** for all four bundles: main and preload as library/SSR builds,
  the renderer and the worker as web builds. A small own script (`scripts/dev.mjs`) runs the
  watch builds and restarts Electron when main or preload change; the renderer uses Vite's hot
  reload. electron-vite was rejected because it lags Vite releases ([dependencies](../dependencies.md)).
- **Packaging**: **electron-builder**, producing for Linux:
  - **`.deb` (official)**: installs to `/opt/galeo` with `galeo.desktop` and icons.
    electron-builder's post-install **installs an AppArmor profile granting `userns` on
    Ubuntu 24.04+** (verified in its v26 templates), which Chromium's sandbox needs there. A custom
    post-install addition installs `/usr/bin/gal` pointing at *our* launcher (the default only
    links `/usr/bin/galeo` to the binary). The generated desktop entry is overridden so it uses
    `Exec=galeo -- %F`.
  - **AppImage (secondary)**: portable, for distributions without user-namespace restrictions.
    On Ubuntu 24.04+ it cannot run sandboxed (its random mount path can't be targeted by an
    AppArmor profile, and the SUID sandbox helper can't work from the mount). A Settings command
    "Install command-line launcher" writes `~/.local/bin/galeo` and a user `.desktop` file.
- **Sandbox: on by default, off only by the user's explicit choice** (amended 2026-09-26, owner
  decision: running unsandboxed is a risk the user may choose to take, as long as they're warned).
  - *(Superseded by ADR-009 for the "sandbox unavailable" relaunch.)* Nothing galeo ships passes `--no-sandbox`: not the `.deb`, the `.desktop` entry, nor the
    `gal` launcher's defaults.
  - The user opts in **per launch**, in one of two ways: `--no-sandbox` on the command line
    (`galeo --no-sandbox …` forwards it), or "Run without sandbox" in the "sandbox unavailable" window.
    When Chromium's sandbox is unavailable, that window names the detected cause and the fix
    (on Ubuntu 24.04+: install the `.deb`) and offers **Quit** (default) or "Run without sandbox"
    with the risk stated. The choice is never persisted: users who want it permanently put the
    flag in their own launcher or alias.
  - The sandbox state is fixed at process start. A later launch forwarded to a running instance
    cannot change it, and document content never can.
  - While unsandboxed, **every window shows a persistent, non-dismissable warning** (status-bar
    badge and a title suffix), so a wrapper or a crafted `.desktop` file that adds the flag is
    visible. Every other SR-01…SR-17 layer stays on (context isolation, CSP, sanitizer, network
    guard, Trusted Types).
- *(Deferred by ADR-011: no macOS/Windows CI or previews until a stable Linux package.)*
  **macOS and Windows previews** from the same config, built on CI runners for each OS:
  macOS `.dmg`/`.zip` (x64 + arm64), Windows NSIS installer. They are **unsigned** and labelled
  *preview*: unsupported, and the release notes say macOS Gatekeeper and Windows SmartScreen will
  warn. They get OS file associations from the bundle/installer, and "Install `galeo` command"
  (macOS: link into `/usr/local/bin`; Windows: PATH via the installer).
- **Desktop entry**: `Exec=galeo -- %F` (SR-13), `MimeType=text/markdown;text/x-markdown;text/plain;text/x-log;`
  (MDX is v0.3: shared-mime-info maps `*.mdx` to a Sega 32X ROM type and has no `text/mdx`, so
  the package will first have to define one), `StartupWMClass` set, and an action "New Window". The app never makes itself
  the default handler; the user chooses that.
- **`gal` launcher**: a small POSIX shell script. It passes arguments after `--`, as absolute
  paths, to the app binary, which forwards them to the running instance (ADR-005).
- **Fuses** (SR-08) are set at package time through electron-builder's `electronFuses`
  configuration (verified in its schema, v26.15). A post-package
  CI step reads the fuses back from the binary (`@electron/fuses`) and fails if any is wrong.
- **Releases**: semantic-release on `main` (Conventional Commits, same as the sibling projects).
  A build matrix (ubuntu, macos, windows) produces each OS's artifacts in parallel; a single final
  job collects them, writes `SHA256SUMS` and GitHub artifact attestations (build provenance),
  and publishes the GitHub Release through semantic-release. Actions are pinned by SHA (SR-10).
- **Updates**: no auto-updater and no update check (zero network). Users update by installing a
  new `.deb`/AppImage. Renovate/Dependabot tracks `electron`, and the SR-09 policy (a release
  within 7 days of a critical/high Electron security fix) is documented in `docs/RELEASING.md`.
- **npm**: not in v0.1. An optional `npm i -g galeo` channel for developers may follow, clearly
  labelled: it cannot provide desktop integration (no `.desktop`/app bundle, so no double-click
  or Open With) and runs the generic Electron binary, so SR-08 fuses and ASAR integrity do not
  apply to it.
- **Not in v0.1**: signed macOS/Windows releases, Flatpak, Snap, an apt repository, `.rpm`, Linux
  arm64.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **electron-builder** | `.deb` and AppImage from one config; Linux file-association and `.desktop` generation; fuse support; widely used | Third-party (not an Electron org project); large config surface | **Chosen** |
| Electron Forge | Official Electron tool; fuses plugin; deb/rpm/flatpak/snap makers; its own Vite plugin | AppImage only through community makers | Rejected for v0.1 (revisit if AppImage is dropped) |
| Flatpak (in addition) | Discoverable on Flathub; sandboxed | The sandbox conflicts with "open any file, including dot-folders" (needs broad filesystem permissions, which defeats the sandbox); `galeo` from the host needs extra wiring; the Electron base-app update cadence adds a dependency on SR-09 timing | Deferred (PRD Open Question) |
| npm as the main channel | OS-agnostic; `npm update -g`; familiar to developers | No desktop integration (PRD stories 2 and 4 fail); generic Electron binary (no fuses, SR-08); install scripts download Electron (breaks with `--ignore-scripts` and on restricted networks) | Rejected as main channel; possible secondary channel after v0.1 |
| Signed macOS/Windows in v0.1 | Full cross-platform release | Apple Developer ID (US$99/yr) + notarization, Windows signing cost; the owner has no macOS/Windows machine to verify | Deferred: previews only |
| Snap | Auto-updates | Store and snapd coupling; confinement conflicts with "open any file" like Flatpak's; automatic updates conflict with the no-network posture | Rejected |


## Consequences

### Positive
- One tool for every format; double-click and "Open With" work right after installing the `.deb`,
  and the `.deb` runs fully sandboxed on Ubuntu 24.04.
- Supply-chain controls (CI-only builds, checksums, attestations, verified fuses) are part of
  the pipeline from the first release.

### Negative
- No auto-update: users must notice new releases. Mitigation: release notes, GitHub
  "watch releases", and an apt repository later if there's demand.
- The AppImage can't run sandboxed on Ubuntu 24.04+. There it runs only if the user opts in to
  unsandboxed mode each launch, with the warning shown. AppImage users must run "Install
  command-line launcher" once to get `galeo`.
- Unsandboxed mode means a renderer exploit from hostile content (threat model T1/T4) runs with
  the user's full privileges. That risk is the user's to accept, and the UI keeps it visible.

### Risks
- **The packager's fuse support is misconfigured, or changes between versions.** Mitigation:
  reading fuses back from the built binary is a CI gate.
- **The sandbox check misfires** (false "unavailable"). Mitigation: e2e on Ubuntu 24.04 with the
  `.deb` in the release checklist; the error names the detected cause.
- **MIME association differences across distros.** Mitigation: Ubuntu 24.04 is the only
  supported target in v0.1; other distros are best-effort.

## Revisit triggers
- Users ask for Flathub distribution: re-evaluate the Flatpak sandbox trade-off.
- A cross-platform release (macOS/Windows) is planned: add signing and notarization, and
  revisit update delivery.
- electron-builder maintenance slows noticeably: migrate to Electron Forge.
- A signing budget and a way to test on macOS/Windows exist: promote previews to official.
- Developer demand for npm installs: add the secondary npm channel.
