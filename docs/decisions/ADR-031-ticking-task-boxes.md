# ADR-031 — Ticking task boxes in the rendered view

- Status: Accepted (2026-11-05, owner)
- Date: 2026-11-05
- Deciders: project owner
- Builds on: [ADR-004](ADR-004-security-and-zero-network.md) (main checks the page's requests against the
  document it read), [ADR-013](ADR-013-edit-and-save-model.md) (saves), [ADR-014](ADR-014-split-view-and-scroll-sync.md)
  (split view while editing), SR-12, SR-15 and threats T1 and T6 in the [threat model](../security/threat-model.md).
  Amends the accepted residual of T6. Supersedes nothing.

## Context

PRD v0.6 Could Have: tick task boxes (`- [ ]`) in the rendered view, decided by an ADR first. Ticking
changes the file, so it is a write from the reader, and the page is untrusted (T1).

What the code does today:
- Rendered task boxes are disabled checkboxes, each named after its item.
- Writes need an edit grant, which only main gives, on Ctrl+E it sees itself (ADR-013). A save spends
  an input credit.
- Main earns a window an input credit for each key press, click or tap it sees (`input-event`, SR-12),
  but it can't see *what* was clicked. A compromised page can spend a real click on a request of its
  own choosing: the residual T6 already accepts for following the document's own links.
- In edit mode the source is in the page's editor; split view shows the rendered preview beside it.

## Options

1. **Tick while reading, through main.** A click asks main to flip `[ ]` ↔ `[x]` on that item's line.
   Main checks what it can: a real input credit, a line its own parse of the file shows as a task item,
   and the file unchanged since the page read it; then it saves as Ctrl+S does.
   - Residual: a compromised page can flip task boxes in any file open in its window's tabs, once per
     real key press or click of the reader, which T6 accepts today only for the one file in edit mode.
2. **Tick only in the preview while editing.** The click edits the editor's text; Ctrl+S saves.
   No new write path, but ticking needs Ctrl+E and split view first.
3. **Drop it.**

## Decision

Option 1 (owner, 2026-11-05), with option 2's behaviour kept in edit mode.

- **Reading:** task boxes are enabled. A click or Space sends `documents.toggleTask(id, line, base)`
  (zod-validated; `base` is the content hash the page loaded). Main:
  1. finds the tab in the sending window (not the Settings tab), and refuses while the tab is in edit
     mode (the editor holds the text there);
  2. spends an input credit, or refuses (`no-input`);
  3. reads the file under the read cap; refuses with `conflict` unless its hash is `base`;
  4. decodes it as a read does, and runs its own reference extraction (the shared parser, in the task
     worker, with its time budget) to find the source lines of task items; refuses `not-a-task` unless
     `line` is one (a `[ ]` in a code block or in raw HTML isn't);
  5. flips that line's box and saves through `saveDocument` with the same `base` (SR-15: atomic,
     encoding, byte order mark and line endings kept), then remembers the new identity, as a save does.
  The page then reads the file again; change marks take the new text as seen (the reader's own tick
  isn't marked, ADR-030).
- **Edit mode:** the split view's preview ticks the editor's text instead (option 2): an ordinary edit,
  unsaved until Ctrl+S. Main refuses `toggleTask` for a tab in edit mode.
- The box shows the file's state: a click is undone on screen at once, and the box changes when the
  new text arrives; a refusal says why in the status bar.

## Consequences

- One new request channel, scoped like a save: input credit, base check, main's own parse, atomic save.
- T6's accepted residual grows: a compromised page can flip `[ ]` ↔ `[x]` on task-item lines of any file
  open in its window, once per real input of the reader. It can't write anything else, can't create a
  file, and can't write a file that changed since it was read. The threat model's T6 row and SR-12 say so.
- Undo is ticking again; there is no undo history outside edit mode.
- Revisit if task items grow other kinds of in-place edits: each one widens the same residual.
