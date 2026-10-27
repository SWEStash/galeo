# ADR-026 — Window lifecycle: features hook themselves to a window

- Status: Accepted (2026-10-27, owner)
- Date: 2026-10-27
- Deciders: project owner
- Related: [ADR-002](ADR-002-window-and-tab-model.md) (windows and tabs), [ADR-019](ADR-019-moving-tabs-between-windows.md)
  (tabs move under their id), [ADR-022](ADR-022-drag-tokens.md) (drags across windows),
  [ADR-025](ADR-025-no-window-host-port.md) (window code stays in Main)

## Context

Every main window is opened by one function in `src/main/index.ts`. It creates the window and handles six of
its events: move and resize, focus, close, input, renderer crash, and closed. The handlers share nothing but
the window, and together they reach 29 names from the composition root. On `closed` it cleans up 18 pieces of
per-window state by hand, one line each. Each line was added by the feature that needed it (warm tabs,
grants, drops, find, crash recovery, unsaved changes and others), so every new feature with per-window state
has to edit this function, and a forgotten line leaks that state for the life of the app.

The per-window state lives in shared registries keyed by window id (`TabRegistry`, `EditGrants`, `WarmTabs`,
`CrashRecovery` and others in Core). They are shared on purpose: a tab keeps its id when it moves to another
window, and the move updates several registries in a fixed order (ADR-019); image grants are looked up by an
opaque id with no window; quitting asks about unsaved changes in every window at once; a drag starts in one
window and lands in another (ADR-022).

## Decision

1. **Per-window cleanup is registered, not written into the window code.** Each registry that keeps state
   per window is added once, where the composition root creates it, to one list of window cleanups. When a
   window closes, the list runs in the order it was registered. A new feature with per-window state registers
   its cleanup there and doesn't touch the window code.
2. **Each window behaviour is a small attach function in `src/main/window/`** that takes the window and only
   what that behaviour needs, and adds its listeners: following bounds, focus order, the close guard, input
   credits, crash recovery. The focus order becomes a small class instead of a variable rewritten in three
   places. Listeners are added in today's order, so events are handled in the same order as before.
3. **State that only Main keeps for a window lives with the code that uses it**: inside the one hook that
   uses it (agreed to close, in the close guard), or, when several places use it, in a map that registers
   its cleanup like the registries (emptied by a tab move, the dropped folder).
4. **The shared registries stay as they are.** Windows are still plain numbers to Core (ADR-025).
5. The function that opens a window keeps: creating it, adding it to its profile, the perf mark, calling the
   attach functions, and on `closed` running the cleanup list and then stopping the profile if that was its
   last window.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Registered cleanup, attach functions, per-window state with the code that uses it** | The window code no longer knows each feature; each behaviour unit-tested with its own few dependencies; Core untouched | One cleanup list whose order matters; more small modules in `src/main/window/` | **Chosen** |
| One object per window owning all its state | Nothing to clean up: the object goes with the window | A tab move becomes a coordinated move across five owners; lookups without a window and cross-window operations need a global index again; rewrites 11 Core classes, their tests and the main call sites | Rejected |
| Move the function as is behind a dependencies object | Shorter `index.ts` | The same 29 dependencies behind one object; needs 29 fakes to test | Rejected |
| Only the cleanup list and the focus-order class | Small | The unrelated handlers stay bundled in one function | Rejected |
| One record per window for Main's own per-window state | One cleanup for all of it | Every writer outside the window code looks the record up and handles a window that is gone | Rejected (amended 2026-10-27, owner) |
| A string-keyed event bus | Loose coupling | Loses types and hides the order handlers run in | Rejected |

## Consequences

- A feature that keeps per-window state registers its cleanup where it is created; reviews check for that
  instead of for a line in the window code.
- Cleanup order is the registration order. Where order matters it is kept explicit: per-tab cleanups run
  before the tab registry forgets the window, and stopping the profile runs last, after the cleanups.
- Window behaviours get unit tests with a fake window; the e2e suites keep covering the whole.

## Revisit triggers

- Per-window state that no longer moves or is looked up across windows becomes most of the state (then one
  object per window is worth reconsidering).
- A shell other than Electron is planned (ADR-025).
