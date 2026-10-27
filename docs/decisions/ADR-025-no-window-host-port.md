# ADR-025 — No WindowHost port: window code stays in main

- Status: Accepted (2026-10-27, owner)
- Date: 2026-10-27
- Deciders: project owner
- Supersedes: in [ADR-007](ADR-007-platform-seam.md), the `WindowHost` row of the ports table and
  "`WindowHost`/app-lifecycle adapters" in its portability rules. The rest of ADR-007 stands: the inward
  dependencies, the other ports, the typed IPC contract and the boundary check.
- Related: [ADR-001](ADR-001-app-shell-stack.md) (reversibility), [ADR-002](ADR-002-window-and-tab-model.md)
  (windows and tabs), [ADR-011](ADR-011-defer-macos-windows-ci.md) (macOS and Windows deferred)

## Context

ADR-007 listed a `WindowHost` port: Core would create, focus and close windows, hear focus and capability
keys, and show context menus through it. The interface was written with the other ports in v0.1 (in
`src/core/ports/`), but nothing implements it and nothing in Core uses it. Only its
`MenuItem` type is used, by the document menus.

Core never needed windows. The tab registry, grants and metrics key windows by a number (the page's id).
Routing decides which profile and window a file goes to, and Main carries the decision out. Window work is
all Electron: `BrowserWindow` options, the frameless title bar, `before-input-event`, native menus,
attention requests and crash events. It lives in `src/main/window/` and `src/main/index.ts`.

macOS and Windows (backlog #13, v0.5) still run on Electron, so they need different window code in Main, not a
second implementation behind a port. A future Tauri shell (ADR-001's trigger) would rewrite Main anyway.

## Decision

1. There is no `WindowHost` port. `WindowHost` and `WindowId` are deleted; `MenuItem` stays a port type, in
   its own file.
2. Window code (creation and options, title bar, window events, capability keys, native menus, attention)
   belongs in `src/main/window/` (some of it is still in `src/main/index.ts`). OS-specific window behaviour
   goes there, and app-wide behaviour (macOS keeping the app alive with no windows) goes in the lifecycle
   adapter.
3. Core keeps taking window ids as plain numbers and is told about window events through its own methods
   (the registry, the keeper, crash recovery), as today.
4. The ports are the ones in `src/core/ports/`:

   | Port | Responsibility |
   |---|---|
   | `FileSystem` | stat, read with size caps, atomic write, realpath, bounded readdir |
   | `FileWatcher` | watch and unwatch files; coalesced change, rename and delete events |
   | `InstanceChannel` | single-instance lock; open requests from later launches and macOS `open-file` |
   | `OsShell` | open an external URL or a path, reveal in the file manager |
   | `Clipboard` | write text (Main writes; the page never does) |
   | `AppPaths` | config, state and cache directories |
   | `SystemMetrics` | per-window memory samples for lifecycle pressure |
   | `TaskRunner` | run a Core function in a worker thread with a time budget |
   | `FontCatalog` | the installed font families, empty where they can't be listed |
   | `Clock` | time, for debouncing and tests |

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Delete the port; window code stays in Main** | Matches the code; no abstraction without a user | A future shell rewrites window code (it rewrites Main anyway) | **Chosen** |
| Implement `WindowHost` and move the window lifecycle behind it | Follows ADR-007 as written | An adapter and fakes for a seam no planned item needs; Core would gain window logic it doesn't have today | Rejected |
| Leave the unused interface | No work | ADR-007 and ARCHITECTURE describe a seam that doesn't exist; dead types | Rejected |

## Consequences

- ADR-007's ports table, ARCHITECTURE's adapter list and the code agree.
- Moving window code out of `src/main/index.ts` produces Main modules, not port adapters.
- If Core ever needs to drive windows itself (for example window placement rules), that is a new port and
  a new ADR.

## Revisit triggers

- A shell other than Electron is planned.
- Core logic needs to create, focus or close windows on its own.
