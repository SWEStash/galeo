# ADR-005 — Profiles and session persistence: one process, XDG JSON files, last-focused routing

- Status: Accepted (2026-09-25, with review amendments; amended 2026-09-28: session snapshots rotate
  once per run)
- Date: 2026-09-25
- Deciders: project owner
- Related: [PRD](../PRD.md) (stories 1–3, 9, 10; Open Question 1), [UX](../design/ux.md) (F1, F2,
  F5, F6), [ADR-002](ADR-002-window-and-tab-model.md), [Threat model](../security/threat-model.md)
  (SR-13, SR-16, SR-17)

## Context

A profile is a named context, like a Chrome profile. It has its own windows and tabs (the
session) and its own settings (theme, fonts, custom CSS), which inherit from global defaults.
Profiles must reopen where they were left. Files opened without `--profile` go to the
last-focused window.

Constraints: no database; plain files; nothing written into user folders; state must survive
crashes; and on GNOME Wayland an application **cannot learn which workspace is current** or
which workspace its windows are on.

## Decision

### Process and storage
- **One app process serves all profiles.** A profile is a label on windows plus its settings. It
  is not a separate Chromium profile or process. All windows share one Electron session, so the
  zero-network rules apply uniformly (ADR-004).
- **Profile identity**: a stable id (slug assigned at creation) separate from the display name,
  so renames keep sessions, settings and scripts that use the id. A `default` profile always
  exists and cannot be deleted.
- **`--profile X` resolution**: match an id first, then a name (case-insensitive). An unknown `X`
  creates the profile and shows a toast **"Created profile 'X' · Undo"**; Undo deletes it and
  re-routes the files by the no-profile rule (protects against typos).
- **Files** (directories `0700`, files `0600`, SR-16). Locations come from the `AppPaths` port:
  XDG on Linux (shown below); on macOS/Windows previews, Electron's `app.getPath()` equivalents
  (`~/Library/Application Support/galeo`, `%APPDATA%\galeo`) with the same layout:

  ```
  $XDG_CONFIG_HOME/galeo/            (~/.config/galeo)
    settings.json                       global settings (schema-versioned)
    custom.css                          global user CSS
    profiles/<id>/profile.json          name, accent colour, setting overrides
    profiles/<id>/custom.css            per-profile user CSS
  $XDG_STATE_HOME/galeo/             (~/.local/state/galeo)
    profiles/<id>/session.json          windows → tab records (ADR-002), last-focused order
    profiles/<id>/session.json.1…3      previous session snapshots (rotated)
    profiles/<id>/recent.json           recent files (paths only, max 200, missing pruned)
    app-state.json                      last-used profile, schema version
    chromium/                           Electron userData: single-instance lock, Local State
  $XDG_CACHE_HOME/galeo/             Electron sessionData: Chromium caches only (safe to delete)
  ```
- **Setting precedence**: built-in defaults, then global `settings.json`, then the profile's
  overrides. Custom CSS layers in the same order after the bundled theme.
- **Writes**: session state is saved 2 s after the last change, at most every 10 s while changes
  continue (scrolling), and on quit; always atomically (temp file, fsync, rename). The first save
  of each run rotates the previous file into `session.json.1…3`; later saves in the run overwrite
  `session.json`. The snapshots are therefore the last three runs' final states (rotating on every
  save would keep states only seconds apart), and a "Restore previous session" command recovers
  from a valid-but-wrong session. Reads are schema-validated. An invalid file is backed up and the
  newest valid snapshot is restored, then defaults, with a notice (SR-17). Every file carries a `schemaVersion`, with
  forward-only migrations.
- **Hand-edited config**: `settings.json`, `profile.json` and `custom.css` are watched and external
  edits apply live. The app writes config only when the user changes a setting in the Settings
  tab, re-reading the file immediately before writing (read-modify-write). An invalid hand edit
  is left in place and reported with a notice; it is never overwritten.

### Lifecycle
- A profile is **running** while it has at least one window. Closing its last window saves and
  stops it. Quit (Ctrl+Shift+Q) saves all running profiles. Starting a profile restores all its
  windows with tabs hibernated (UX F6).
- When the last window of the last running profile closes, the app exits on Linux and Windows;
  on macOS it stays alive without windows (platform convention, ADR-007).

### Routing (single instance)
- The first process takes the Electron single-instance lock. Later launches forward
  `{argv, cwd}` and exit. The arguments are parsed as data with a strict schema (SR-13).
  On macOS, Finder opens arrive as `open-file` events instead of argv; the `InstanceChannel`
  adapter normalises both into the same "open request" for the Router.
- Target selection:
  1. `--profile P`: P's last-focused window, starting P if it isn't running.
  2. No profile: the **last-focused galeo window** of any profile.
  3. No window: the last-used profile (`app-state.json`), else `default`.
  4. `--new-window`: always a new window in the target profile.
- "Last-focused" is tracked in main from window focus events.

### Wayland workspace awareness (PRD Open Question 1)
**Accepted limitation for v0.1.** We run as a native Wayland client and route to the last-focused
window even if it sits on another workspace.

**Focus behaviour (owner decision): add the tab, don't steal focus.** galeo does not try to
raise a window from another launch's activation token, so the user is never moved to another
workspace. GNOME shows its "galeo is ready" notice. `--profile` and `--new-window` put the file
where the user is when that matters.

What makes this workable:
- `--new-window`;
- drag-and-drop into the window you're looking at, which is always precise;
- per-profile launchers (PRD "Could").

**Rejected for v0.1: running under XWayland** to read workspace information. That trades away
native Wayland rendering (fractional scaling sharpness, input handling) for a heuristic.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **One process, profiles as labels + XDG JSON files** | Simple; one lock, one session, one network policy; plain inspectable files | A crash affects all profiles (mitigated by frequent atomic saves and hibernated restore) | **Chosen** |
| A process per profile (separate user-data dirs, like Chrome) | Crash isolation between profiles | Several single-instance locks, so routing across profiles gets complex; memory multiplied; network policy duplicated | Rejected |
| SQLite or LevelDB store | Transactions | Violates "zero database"; overkill for a few KB of state | Rejected |
| `localStorage`/IndexedDB in the renderer | No file code | State inside Chromium data, tied to the renderer and harder to validate or back up; main can't read it for routing | Rejected |
| XWayland for workspace-aware routing | Could route to the current workspace's window | Loses native Wayland quality; brittle heuristic | Rejected for v0.1 |

## Consequences

### Positive
- Profiles are cheap: a folder with two small files each.
- Sessions survive crashes and restarts. The files are human-readable and easy to back up or
  delete.

### Negative
- On GNOME Wayland, a file opened without `--profile` from another workspace can land in a
  window on a different workspace.
- All profiles share one process (and one crash domain).

### Risks
- **Session file corruption.** Mitigation: atomic writes, validation, backup and fallback.
- **Stale paths in sessions** (files moved or deleted). Mitigation: the *missing* state with
  automatic recovery (UX states).

## Revisit triggers
- GNOME/Mutter exposes workspace information to clients (for example through a Wayland
  workspace protocol that GNOME implements): implement workspace-aware routing.
- A real need for crash isolation between profiles.
- Users ask for "bring the window forward" behaviour: evaluate forwarding the Wayland activation
  token (unverified in Electron) as an opt-in setting.
