# ADR-014 — Split view: both views in one tab, block-level scroll sync, a debounced preview

- Status: Proposed (2026-10-08)
- Date: 2026-10-08
- Deciders: project owner
- Builds on: [ADR-003](ADR-003-rendering-pipeline-and-format-registry.md) (the render worker,
  `data-src-line` positions, `capabilities.split`), [ADR-006](ADR-006-renderer-ui-framework.md)
  (documents live outside React), UX F10 and F13 ([UX](../design/ux.md)),
  [ADR-013](ADR-013-edit-and-save-model.md) (editing). Supersedes nothing.

## Context

v0.2 shows source and rendered views side by side, scrolled together at block level, with the
preview following the user's typing without visible lag on a 5,000-word article (PRD "Split
view", UX F13: Ctrl+\, source on the left, a draggable divider that double-click resets to
50/50).

What exists in v0.1:

- Each tab's Document Host shows **one** view at a time: the rendered article or the CodeMirror
  source, the other hidden.
- The worker puts `data-src-line` (a block's first source line) on paragraphs, headings, list
  items, code blocks, blockquotes, table rows and rules. Switching views (Ctrl+U) already keeps
  the reading position through them (`renderedTopLine`, `scrollRenderedTo`, the source view's
  `topLine`/`scrollToLine`).
- A render has a 2 s budget; over it, the worker is replaced and the tab falls back to source.
  Results are cached by content hash (16 entries). Mermaid draws on the UI thread, lazily.
- A tab's view state (`view`, `follow`) is kept per history entry and in the session.

## Decision

### Layout

- Split is a third view mode, `split`, beside `rendered` and `source`, for formats whose
  descriptor has `capabilities.split` (Markdown and MDX). Ctrl+\ toggles it; Ctrl+U in split
  leaves split for the other single view.
- The Document Host mounts both views at once in split mode: source on the left, rendered on the
  right, each with its own scroll container. Editing (ADR-013) is independent: split works in
  read-only and in edit mode.
- The divider is a focusable separator (`role="separator"`, arrow keys move it, double-click or
  Home resets 50/50). Its ratio is per tab, kept in the view state and the session; the minimum
  pane is 20 % of the width.
- Below a minimum window width (about 700 px) the tab shows the rendered view only, and split
  returns when the window widens.

### Scroll sync

- Sync is by **block**, through `data-src-line`. The worker also emits the block's last line
  (`data-src-end`), so a long block (a code listing, a table) is followed proportionally inside
  it instead of jumping block by block.
- The pane the user last scrolled (wheel, keys, scrollbar, the editor's cursor moving off-screen)
  leads; the other follows on the next animation frame. A follower's own scroll event is
  ignored while it is following, so the two never drive each other in a loop.
- Find, outline jumps and links scroll the pane they act in, which then leads.

### Live preview

- While editing in split, a change re-renders after typing pauses for 150 ms, and at least every
  1 s during continuous typing. Only the latest text is rendered; older requests in flight are
  dropped (the page already ignores answers for stale text).
- Live renders skip the content-hash cache (each keystroke would evict useful entries) and use
  the normal 2 s budget. A live render over budget keeps the **last good preview** with a notice
  ("Preview paused: this document takes too long to render"); it does not switch the tab to
  source, as it would in reading.
- The rendered pane is updated in place, keeping the leading pane's position; diagrams and math
  whose source didn't change keep their drawn output (keyed by their text), so typing in a
  paragraph doesn't redraw Mermaid.

## Options considered

| Option | Why not |
|---|---|
| Two tabs or two windows kept in step | Doubles the tab and session model for one feature; the tab is the unit of a document everywhere else |
| Line-level sync (every source line mapped to a pixel) | Needs positions on inline content, which grows the HTML and the work per render; block level is what the PRD asks for |
| Proportional sync (same scroll fraction) | Drifts badly with diagrams, tables and code, which are exactly what a writer checks |
| Rendering on every keystroke | Wastes the worker on intermediate text and makes Mermaid flicker; a short pause is not visible as lag |
| An incremental (per-block) renderer | Much more complex, and the full render of a 5,000-word article is well within budget; revisit if measurements say otherwise |

## Consequences

### Positive

- Reuses the view-switch machinery and the worker as they are; split adds a mode, not a pipeline.
- One more position attribute per block; no change to sanitizing or Trusted Types.

### Negative

- A split tab holds both views' memory (the rendered DOM and CodeMirror), so a warm split tab
  weighs more in the warm-tab budget (ADR-002); its weight is reported as the sum.
- Two scroll containers make focus order and find slightly more involved: find searches the pane
  that has focus, or the source pane when neither has.

### Risks

- Long documents with many diagrams: a re-render per pause must stay under the budget. The perf
  harness gets a "type in a 5,000-word article in split" case with a budget for the time from the
  last keystroke to the preview update.

## Revisit triggers

- The typing case misses its budget on the owner's machine → incremental rendering.
- A request for split on non-Markdown formats (e.g. a JSON tree next to its source, v0.3).
