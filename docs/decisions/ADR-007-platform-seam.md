# ADR-007 — Platform seam: Electron-free core behind ports, typed IPC contract, renderer never imports Electron

- Status: Accepted (2026-09-26, with review amendments)
- Date: 2026-09-25
- Deciders: project owner
- Related: [ADR-001](ADR-001-app-shell-stack.md) (reversibility), [ADR-002](ADR-002-window-and-tab-model.md),
  [ADR-004](ADR-004-security-and-zero-network.md), [ADR-005](ADR-005-profiles-and-session-persistence.md)

## Context

ADR-001 chose Electron and promised to keep the shell replaceable. The named trigger is Tauri v3
with the Chromium runtime reaching stable. The most valuable logic is not Electron-specific:
- routing,
- the tab registry and lifecycle,
- session and settings persistence,
- capability checks,
- format detection,
- the rendering pipeline.

If that logic is written directly against Electron APIs, it cannot be unit-tested without
Electron, and changing shells means rewriting it.

## Decision

A single package, organised so dependencies point inward:

```
src/
  shared/      contracts: IPC request/response/event types + runtime schemas, domain types
               (TabRecord, ProfileId, FormatDescriptor ids). No runtime dependencies on Node/Electron/DOM.
  core/        pure TypeScript domain logic: routing, tab registry + lifecycle policy, session and
               settings model + migrations, capability checks, argv parsing, link extraction.
               Depends only on shared/ and on *ports* (interfaces) it defines.
  main/        Electron + Node adapters implementing core's ports; window creation; protocol,
               network block, fuses-dependent setup; IPC handlers (validate → call core).
  preload/     the only bridge: exposes a typed `window.galeo` API built from shared/ contracts.
  renderer/    React chrome + document host (ADR-006) + worker pipeline (ADR-003).
               Talks only to `window.galeo`; never imports electron or node modules.
```

**Ports** that core defines and main implements:

| Port | Responsibility |
|---|---|
| `FileSystem` | stat, read (with size caps), atomic write (v0.2), realpath, readdir (bounded) |
| `FileWatcher` | watch and unwatch individual files; coalesced change/rename/delete events (own implementation: parent-directory `fs.watch` + name filter) |
| `InstanceChannel` | single-instance lock; delivers open requests from later launches (`{argv, cwd}`) and, on macOS, from `open-file` events |
| `WindowHost` | create, focus and close windows; focus events; send events to a window; `before-input-event` capability keys; native context menus built by main (ADR-004) |
| `OsShell` | open external URL, open path, reveal in file manager |
| `AppPaths` | config, state and cache directories (XDG on Linux; `app.getPath()` on macOS/Windows) |
| `SystemMetrics` | per-window memory samples (`app.getAppMetrics()`) for lifecycle pressure (ADR-002) |
| `TaskRunner` | run a core function in a worker thread with a time budget; terminate and respawn on overrun (link/image extraction, ADR-004) |
| `Clock` | time, for debouncing and tests |

Rules:
- `core/` must not import `electron`, `node:*` or DOM types. This is enforced by TypeScript
  project references plus our own boundary script (`scripts/check-boundaries.mjs`) in CI.
- The renderer must not import `electron` or `node:*` (same enforcement).
- Every IPC message is defined once in `shared/`: its types, its runtime schema and its channel
  name. **Schemas (zod) are used only in main**, which validates on receipt (SR-11). The preload
  builds its API from a plain table of channel names, and the renderer imports **types only**
  (`import type`), so zod never enters the preload or renderer bundles. The boundary script
  enforces this split, and types, schemas and channels come from one definition, so they cannot
  drift.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Ports-and-adapters core + typed contract (single package)** | Logic unit-tested in plain Node with fakes; shell swap limited to `main/` + `preload/`; one place for IPC validation | Some interface ceremony | **Chosen** |
| Logic written directly in Electron main | Least code at first | Untestable without Electron; the shell is locked in; IPC validation scattered | Rejected |
| Monorepo with packages (core, main, renderer…) | Hard package boundaries | Workspace and packaging overhead for a single-app repo; electron-builder is simpler with one package | Rejected for now; folder boundaries + lint achieve the same |

**Portability rules** (Linux official, macOS/Windows previews, ADR-008): no hard-coded paths,
separators or shells outside `main/` adapters; shortcuts use Electron's `CmdOrCtrl` and the
keymap has a macOS variant; OS-specific behaviour (macOS app-stays-alive with no windows,
global menu bar, title-bar style) lives in `WindowHost`/app-lifecycle adapters only.

## Consequences

### Positive
- Most behaviour (routing rules, lifecycle, migrations, capability checks) runs under vitest
  without launching Electron.
- A future Tauri v3 + CEF shell would reimplement `main/` adapters and `preload/`, keeping
  `shared/`, `core/` and `renderer/`.

### Negative
- Port interfaces must be designed up front for the v0.1 capabilities, and extended carefully
  later.

### Risks
- **Boundary erosion** (a quick Electron import in core). Mitigation: the CI import check fails
  the build.

## Revisit triggers
- The package grows enough that folder boundaries stop being enough: split into workspace
  packages.
