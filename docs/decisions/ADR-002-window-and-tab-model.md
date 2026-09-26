# ADR-002 — Window & tab model: one renderer per window, tabs as in-page views with a lifecycle

- Status: Accepted (2026-09-25, with review amendments)
- Date: 2026-09-25
- Deciders: project owner
- Related: [ADR-001](ADR-001-app-shell-stack.md), [PRD](../PRD.md) (performance targets),
  [UX](../design/ux.md) (F4, F6, F7), [Threat model](../security/threat-model.md) (SR-14)

## Context

The PRD requires Chrome-like speed with many open tabs across several windows and profiles:
cold start under 500 ms, a new tab under 100 ms, a warm-tab switch within the next frame,
a hibernated tab back at its scroll position within 150 ms, and a memory baseline that must not
regress at about 3 profiles and 20 tabs. Users keep tabs open for days as reminders, so most
tabs are idle most of the time.

In Electron every `BrowserWindow` has at least one renderer process. Additional
`WebContentsView`s (the Chrome model, one per tab) each add a renderer process and its memory.

## Decision

1. **One renderer process per window.** A window's tabs are views inside that window's page,
   not separate web contents.
2. **Tabs have three states**, managed per window:
   - **Active**: rendered and visible.
   - **Warm**: rendered DOM kept but hidden with `content-visibility: hidden` or detached (never
     `display: none`, so CodeMirror views can re-measure when shown), for instant switching.
     Warm tabs are an LRU set limited by **count and weight**: default 3 tabs *and* about 20 MB of
     rendered HTML per window, whichever is reached first (both configurable).
   - **Hibernated**: DOM discarded. Only a *tab record* remains: path, view mode (including log
     follow-end), scroll anchor, file identity (mtime + size + content hash), and per-tab
     back/forward history whose entries carry their own anchors.
3. **Scroll position is a block anchor, not pixels.** It is the source position of the first
   visible block plus an offset inside it. This survives re-layout, zoom, theme changes and live
   reload (UX F7).
4. **Split ownership, so interaction never waits on IPC.**
   - **Main owns tab existence**: the tab records for all windows and profiles, their order and
     window membership. It uses them for routing, session persistence (ADR-005), moving tabs
     between windows and crash recovery.
   - **The renderer owns presentation**: which tab is active and which are warm, DOM and render
     caches. Activation is applied locally at once and reported to main afterwards; anchor
     changes are reported debounced.
   - Main's lifecycle policy makes only non-urgent decisions (demoting warm tabs to hibernated),
     sent to the renderer as instructions.
   - **Memory pressure** is our own signal: main samples per-window memory with
     `app.getAppMetrics()` and demotes warm tabs past a configurable threshold (default: the
     performance-harness baseline plus headroom).
   - **Live reload**: the active tab re-renders immediately; warm tabs are marked stale and
     re-render in idle time or on activation; hibernated tabs refresh on wake.
5. **Heavy work leaves the UI thread.** Parsing and highlighting run in a Web Worker per window
   (ADR-003). A parse cannot be interrupted, so the time budget (initially 2 s) is enforced by
   **terminating and respawning the worker**; the tab then shows "too slow to render — showing
   source". The UI thread only inserts the resulting HTML (bounded by the size limits) and runs
   DOM-dependent renderers (Mermaid) lazily, when blocks scroll into view.
6. **Moving tabs between windows** and tear-off are record transfers: main moves the tab record
   and the destination renderer renders it as if waking a hibernated tab.
7. **Crash recovery.** Before inserting a document, the renderer sends main a breadcrumb
   ("rendering tab X"). If the renderer crashes, main recreates the window from the registry with
   all tabs hibernated, and marks the breadcrumb tab *crashed* so it is not auto-rendered again
   (SR-14).

## Options considered

### Option 1: One renderer per window, in-page tabs (chosen)
**Pros**: memory grows with windows, not tabs; switching tabs is a DOM swap with no process
start; one worker and one set of lazily loaded libraries shared by all tabs in the window.
**Cons**: a hang or crash in one document affects the window's other tabs; tab isolation is
logical, not by process.
**Complexity**: Medium · **Reversibility**: Moderate

### Option 2: `WebContentsView` per tab (Chrome's model)
**Pros**: process isolation per tab; a crashing tab doesn't take its siblings down.
**Cons**: a renderer process per tab (tens of MB each) directly against the memory goal; every
new tab pays a process start, against the 100 ms target; libraries loaded once per tab; tab
bar and document live in different web contents, which complicates focus, find and
drag-and-drop.
**Complexity**: Medium · **Reversibility**: Moderate

### Option 3: Keep every tab rendered (no lifecycle)
**Pros**: simplest; every switch is instant.
**Cons**: memory grows without bound with long-lived reminder tabs; session restore renders
everything at start, against the cold-start target.
**Complexity**: Low · **Reversibility**: Easy

## Consequences

### Positive
- Predictable memory: roughly one renderer per window plus a bounded warm set.
- Fast restore: a profile with 20 tabs renders only each window's active tab at start.
- Tab records are plain data, which makes session persistence, routing, moving tabs and
  crash recovery the same operation.

### Negative
- Waking a hibernated tab re-parses and re-renders the file (budgeted at 150 ms; measured by the
  performance harness).
- A pathological document can stall its window. This is mitigated by worker parsing with time
  budgets and by crash recovery.

### Risks
- **Anchor drift after big edits by an agent.** Mitigation: fall back to the nearest heading, then
  to a proportional position.
- **The warm budget is wrong for real use.** Mitigation: count + weight limits, both
  configurable, with sampled memory-pressure demotion; the harness records memory at the PRD's
  reference workload.
- **Split ownership drifts** (renderer and main disagree about a tab). Mitigation: main is
  authoritative for existence and order; the renderer re-syncs from main's registry on any
  mismatch event and on window reload.

## Revisit triggers
- Crash or hang isolation becomes a real user problem: move to Option 2 for heavy formats only.
- The performance harness shows hibernated wake over 150 ms on typical documents, or the
  warm limits cause frequent visible re-renders in real use: raise the defaults or add a
  rendered-HTML cache for recently hibernated tabs.
