# ADR-030 — Change marks: what changed since the reader last looked

- Status: Accepted (2026-11-04, owner)
- Date: 2026-11-04
- Deciders: project owner
- Builds on: [ADR-002](ADR-002-window-and-tab-model.md) (tabs, hibernation),
  [ADR-003](ADR-003-rendering-pipeline-and-format-registry.md) (blocks carry their source lines),
  [ADR-013](ADR-013-edit-and-save-model.md) (edit mode, saves, the read-only diff),
  [ADR-014](ADR-014-split-view-and-scroll-sync.md) (split view). Supersedes nothing.

## Context

PRD v0.6 Must Have 1 asks galeo to mark what changed in a document since the reader last looked at
it, so an agent's edits can be reviewed without reading the whole file again. The owner's calls
(2026-11-04):
- The baseline is "since you left the tab": coming back marks what changed while you were away.
  While a tab is shown, changes add up against the version you found when you arrived.
- Marks show in rendered Markdown (blocks) and in the source and text views (lines). Not in the JSON
  tree, the table or logs.
- Marks live in memory only; they don't survive a restart.

What exists today:
- A tab's text lives in the page only while the tab is rendered. A hibernated tab holds nothing,
  and reads its file again when shown (ADR-002).
- Main tells the page when a tab's file changed (`tabs.stale`), and the page reads it again.
- Rendered blocks carry `data-src-line` and `data-src-end` (ADR-003); the source view is CodeMirror.
- `@codemirror/merge` already ships, loaded lazily for the save-conflict diff (ADR-013). Its `diff()`
  takes a scan limit and a timeout.

So the baseline must outlive the document's component: a hibernated tab still needs what it showed
when the reader left it.

## Options

1. **Baselines in the page, one store per window** (recommended). A module-level store holds, per
   tab, the text the reader last looked at. The pane diffs the new text against it on the page's
   thread and marks blocks or lines.
   - Simple: no IPC, no change to the read contract, display state only.
   - Cost: the page keeps a copy of the baseline text of tabs it has hibernated. Bounded by caps.
   - Lost when the window's renderer crashes or the tab moves to another window (as the owner accepted).
2. **Baselines in main, diffed in main's task worker.** Main keeps the text it last sent for each
   tab, and the read answer carries the changed ranges.
   - Survives a renderer crash, and the diff runs off every page thread.
   - Cost: a new field in the read contract, more memory in main (shared by every window), more code
     across the boundary, for a display feature. Main would also need to know when the reader "left"
     a tab, which only the page knows.
3. **Only the latest change** (no baseline store): each reload marks what that read changed. Rejected
   by the owner: an agent writing in bursts would leave only its last burst marked.

## Decision

Option 1.

1. **Where:** a per-window store in the page (`change-marks.ts`), keyed by tab id, holding the text
   and the path it belongs to. Nothing is persisted and nothing is sent to main.
2. **When the baseline is set:**
   - the first time a tab shows its text in this window;
   - when the reader leaves the tab (another tab is shown): the text it showed then;
   - on *Clear change marks*;
   - after the reader's own save, and when edit mode ends: the reader's own edits are never marked;
   - when the tab navigates to another file, or is read again in another encoding: the new text,
     with no marks.
3. **Caps:** a document over 2 M characters gets no baseline, and so no marks (the status bar says
   so when it changes). All baselines together are held to 16 M characters; past that, the ones
   left longest ago are dropped (those tabs then show no marks until looked at again).
4. **Diff:** on a new read of a tab with a baseline, the page loads `@codemirror/merge` lazily and
   runs `diff(baseline, text)` with a scan limit and a timeout. The changes become line ranges in
   the new text: lines changed or inserted, and the points where lines were removed.
5. **Marks:**
   - Rendered Markdown: the innermost positioned block (`data-src-line`..`data-src-end`) that
     overlaps a range gets the `galeo-changed` class; a removal marks the block after it with
     `galeo-removed-before`. Source and text views: a line decoration and a gutter marker.
   - Never colour alone: a bar in the margin, and `aria-description="changed"` on each marked block
     or line, so the text itself (find, word counts) is unchanged.
   - When over half the blocks would be marked, galeo marks none and the status bar says "Most of
     this document changed".
   - Edit mode shows no marks.
6. **Moving:** F7 and Shift+F7 scroll to the next and previous mark and announce "Change 2 of 5";
   the status bar shows the count; *Clear change marks* is a palette command.

## Consequences

- No new IPC, no new capability, no stored data: the threat model is unchanged. The page already
  holds the text it marks.
- The page's memory grows by the baselines of hibernated tabs, at most 16 M characters (~32 MB) per
  window, and only for tabs whose files the reader has looked at. The memory perf test watches it.
- The diff runs on the page's thread. A new budget (`changeMarksMs`, a 1 MB document with 50
  scattered edits) keeps it in check; past the timeout the marks are coarser, never wrong.
- A renderer crash, a move to another window or a restart forgets the baselines: the tabs then show
  no marks until the next change after they are looked at.
- A tab restored hibernated and never shown gets its baseline when first shown, so changes made
  before then aren't marked.

## Revisit triggers

- `changeMarksMs` can't be met on the page's thread: move the diff to the render worker.
- The baselines show up in the memory budget: lower the cap, or keep them compressed.
- The owner wants marks across restarts, or in the JSON tree, the table or logs.
