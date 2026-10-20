# ADR-019 — Moving tabs between windows and profiles: the id in the drag, a single-use drag in main

- Status: Accepted (2026-10-19, owner); points 2 and 4 amended in place the same day (owner), see
  [Amendment](#amendment-2026-10-19); point 1 and the claim in point 3 superseded by
  [ADR-022](ADR-022-drag-tokens.md) (2026-10-20)
- Date: 2026-10-19
- Deciders: project owner
- Builds on: [ADR-002](ADR-002-window-and-tab-model.md) (tab records; "moving tabs between windows and
  tear-off are record transfers"), [ADR-005](ADR-005-profiles-and-session-persistence.md) (sessions, last
  window, profile stop), [ADR-013](ADR-013-edit-and-save-model.md) (edit grants, kept text),
  [ADR-015](ADR-015-edit-grant-for-files-the-reader-chose.md) (the `chosen` flag),
  [ADR-004](ADR-004-security-and-zero-network.md) (capabilities main sees itself), SR-11, SR-12 and SR-16 in
  the [threat model](../security/threat-model.md). Supersedes nothing; it fills in ADR-002's point 6.

## Context

The reader wants to drag a tab onto another window's tab bar, of the same or another profile, and drag it
out of every window to give it a window of its own (PRD v0.3, UX F15). The palette needs the same moves.

ADR-002 says main moves the tab record and the destination renders it "as if waking a hibernated tab". That
leaves the hard parts open:

- **Main's stores are keyed by window.** Edit grants, with their kept unsaved text, are dropped by the next
  sync of the window the tab left. Warm tabs, crash breadcrumbs and file watches are per window too.
- **A dirty tab is never hibernated** (ADR-013): its text lives only in the page's editor.
- **The page is untrusted** (T1, T6). Taking a tab into a window must not let one page pull another
  window's tabs, or claim edit mode (ADR-004).

A spike on the owner's Ubuntu 26.04 (GNOME, Wayland) on 2026-10-15 found:

1. An HTML5 drag with a custom type crosses windows of one process. The other window sees the type, and its
   drop delivers the data.
2. Every window reports its position as 0,0, and drag coordinates are window-relative. There is no screen
   point for placing a torn-off window.
3. A drop outside every window ends exactly like Esc. Nothing tells the source the tab was dropped
   outside, only that no one took it.
4. With `text/plain` in the drag, other applications accept it.
5. Raising another window from a drop, without an activation token, makes GNOME show "galeo is ready"
   instead.

The X11 behaviour was not verified (the owner's platform is Wayland).

## Decision

1. **The drag carries the tab id**, in the type `application/x-galeo-tab` only, never `text/plain`, so no
   other application takes it.
2. **Main holds one pending drag.** When a drag starts, the page asks main `tabs.dragStart(id)`. Main
   accepts only a tab that window owns, and only by spending real input (SR-12): the mouse press that
   started the drag, while its button is still down however long ago it went down, or else a credit of
   real input. When the drag ends, the source tells main `tabs.dragEnd(id, outside)`. The drag stays
   claimable for 500 ms more, because the window it was dropped on asks for it at about the same time and
   the two messages reach main in either order. It ends at a drop, at the end of those 500 ms, or after
   2 minutes, whichever comes first.
3. **A drop is an adopt.** The window under the drop asks `tabs.adopt(id, position)`. Main moves the tab
   only if it is the pending drag's tab and comes from another window, and then the drag is over. So a page
   can take only a tab the reader is dragging, and a drop and a tear-off can't both happen. Main doesn't
   raise the window: the tab becomes its active tab, under the pointer, and GNOME shows no notice.
4. **Tear-off is decided by main.** The source says whether the pointer was outside the window when the
   drag ended, whatever the drop effect: an application that accepts the drop, a desktop that doesn't, or
   none. If it was, no galeo window claimed the drag in those 500 ms, and the window has two or more tabs,
   main opens a new window of the source's profile, at the source's size, and moves the tab there. The
   compositor places it. A window's only tab dragged outside does nothing. Esc pressed outside the window is
   the same signal, so it tears off too.
5. **A move keeps the tab's id and record.** History (with each entry's `chosen` flag, ADR-015), view
   state, scroll position, zoom, reader width and a crashed mark travel. The edit grant, its dirty mark and
   its kept text are moved to the new window before the registry changes, so no sync drops them. Warm-tab
   weight, the crash breadcrumb and the file watch follow the tab. The Settings tab never moves.
6. **Unsaved text travels through main.** Before a drag or a palette move, the source sends main its
   pending unsaved text at once, without the usual 1 s wait. The destination gets it the way a reloaded
   window does after a crash (ADR-013): its new editor asks main for the tab's kept text, and main now also
   says whether the tab is in edit mode. So a dirty tab arrives dirty, and a clean tab in edit mode arrives
   editable. The undo history stays behind. Nothing goes on disk (SR-16), and the destination page can't
   claim edit mode for any other tab.
7. **Into another profile, the tab becomes that profile's.** It is saved in that profile's session, takes
   its settings, and leaves the other profile's session.
8. **The window a tab leaves closes when it is empty.** If it was its profile's last window, the profile
   stops (ADR-005), and its session is saved without that empty window. The moved tab doesn't enter the
   source's reopen-closed list (Ctrl+Shift+T) or the destination profile's recent files: a move isn't a
   close or an open.
9. **The whole tab bar takes the drop.** The empty part of the tab bar is the window's drag handle, which
   gets no drag-and-drop events. While a drag is pending, main tells every window (`tabs.dragging`), and the
   page turns the handle off until the drag ends. A window with no tabs takes the drop too.
10. **The palette does the same.** *Move tab to new window*, and *Move tab to window…*, which lists the
   other windows by profile and active tab. Main moves the tab on `tabs.moveTo(id, window | 'new')`, for the
   sender's own tab only and by spending an input credit, then focuses the target window: the reader asked
   for it there.

## Options considered

| Option | For | Against |
|---|---|---|
| **The id in the drag, a single-use drag in main (chosen)** | Uses what the spike showed working; the destination learns the id only from a real drag; one adopt or one tear-off per drag | Two more round trips per drag; tear-off can't tell Esc from a drop outside, and waits 500 ms |
| The id only in main, the drag carries a marker | The page never sees another window's tab id | The destination still needs to name what it takes, and the drag already proves the reader moved it there |
| The drag carries the tab's state and unsaved text | No main lookup at the drop | Document text in drag data any window or app can read; bypasses grants (ADR-004) and SR-16 |
| Main tracks the pointer to find the drop window | Works without drag events | Wayland gives no global pointer position or window positions (spike) |
| A new tab id at the destination, as reopening a closed tab does | Matches reopen | Every store keyed by tab id (reads, links, grants, watches) would need re-keying, and a race could orphan them |

## Consequences

### Positive

- One move operation in main serves drag, tear-off and the palette, and keeps every store consistent.
- A moved dirty tab keeps its text through the same path as crash recovery, without saving it anywhere.
- A page can't pull tabs it wasn't handed by a reader's drag, and can't move tabs without real input.

### Negative

- Esc pressed with the pointer outside the window tears the tab off. The reader drags it back.
- A torn-off window opens where the compositor puts it, not at the pointer, half a second after the drop.
- A tab dropped on another application doesn't go to it: it gets a window of its own.
- A moved tab loses its undo history.

### Accepted residual risk (T6)

A compromised page can send its own tabs, with their grants and unsaved text, to another galeo window while
the reader is giving input. That window runs the same code under the same rules, and it gains nothing the
source didn't already have. Exfiltration stays blocked (SR-04, SR-06, SR-12).

## Amendment (2026-10-19)

The owner's first manual run on Wayland, with the packaged build, found three faults in the drag as first
decided. The owner chose to amend points 2 and 4 here rather than supersede them.

- **A tab dropped over another application's window didn't tear off.** Some applications accept any drop,
  so the drag ended with a drop effect other than `none`, and the source took that as a drop somewhere.
  The reader expects a window of its own wherever the tab lands outside galeo.
- **A tab dropped on another galeo window often didn't move.** The source's end of the drag and the
  destination's adopt reached main in either order. When the end came first, the drag was over and the
  adopt was refused.
- **A drag started after holding the press over a second did nothing.** The press's credit had lapsed
  (1 s), so main refused the drag start, and later drop or tear-off.

The amendment keeps the drag claimable for 500 ms after its end, lets main decide tear-off from where the
pointer was rather than from the drop effect, and lets a held press start a drag. All of a tab now starts a
drag, not only its name, which is a page fix outside this ADR.

## Revisit triggers

- X11 behaves differently from the spike (no custom type across windows, or a usable screen point).
- Electron gains Wayland activation tokens, so a window could take focus on drop without the notice.
- Readers ask for moving several tabs at once, or for undo history to travel.
