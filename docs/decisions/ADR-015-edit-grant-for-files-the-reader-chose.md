# ADR-015 — Edit mode only for text main has read, and a question from main for files the reader didn't hand over

- Status: Accepted (2026-10-11, owner)
- Date: 2026-10-11
- Deciders: project owner
- Supersedes: the "Edit grant" clause of [ADR-013](ADR-013-edit-and-save-model.md) on *which files*
  Ctrl+E can grant. The rest of ADR-013 stands.
- Builds on: [ADR-004](ADR-004-security-and-zero-network.md) (capabilities main sees itself),
  [ADR-005](ADR-005-profiles-and-session-persistence.md) (sessions), SR-12, SR-15, SR-16 and threat T6 in the
  [threat model](../security/threat-model.md)

## Context

In ADR-013, Ctrl+E toggles the grant of "the active tab", and the page enforces "only a file with
content can be edited". The page supplies both facts:

- The page tells main which tab is active (`tabs.activated`), and needs no key press to do so.
- Main grants whatever tab is active, including one that is missing, empty or not text. A save
  with no base then creates the file.

The v0.2 pre-release security review showed what a compromised page (threat T1) can do with this:

1. It opens a target as a background tab, through a document link (one click's credit) or a
   forged drop. It could also use quick open or Recent files while the reader types: the page
   sends the query and the choice, and each spends one key press.
2. It makes the target active just before the reader presses Ctrl+E.
3. On the reader's next key press, it writes the target, or creates it, for example a `.desktop`
   file in the autostart folder.

A probe did this end to end. The result is code execution outside the sandbox after one ordinary
key press.

Nothing inside the window can warn the reader, because the page draws all of it. On Linux even the
title text isn't drawn: the title bar is hidden, and the page's tab bar sits in its place. Only
native dialogs and menus are out of the page's reach.

## Decision

1. **Main decides what can be edited.** Ctrl+E grants a tab only when main's last read of that
   tab, at that path, was decoded text with content (`reads.shapeOf(id, path)` is set). Main refuses
   missing, empty, binary, too-large and not-a-file tabs, not only the page. A file deleted after
   such a read keeps its shape, so *Save again* still works. A save can therefore never create a
   file the reader never saw.
2. **Main remembers which files the reader handed over.** A tab's history entry carries
   `chosen: true` when the file reached main from outside the page: from the command line,
   from Files (*Open With*, double-click) or from a second launch. A reader's confirmation (point
   3) also sets it. Entries from links, drops, quick open and Recent files don't carry it. Back,
   forward, reopening a closed tab and moving a tab between windows keep each entry's flag. The
   flag is saved in the session next to the path, which is still not document content (SR-16).
3. **For any other file, main asks once.** Ctrl+E on an entry without `chosen` opens a native dialog
   from main that names the full path: *Edit "victim.sh"?*, with the path under it, and the buttons
   *Edit* and *Cancel*. *Edit* grants the tab and marks the entry `chosen`, so it doesn't ask
   again. The grant goes to the tab and path captured at the key press, and only if that tab still
   shows that path when the reader answers.

The page's own refusal message ("can't be edited") stays as the wording the reader sees.

## Options considered

| Option | For | Against |
|---|---|---|
| **Text check + ask for files the reader didn't hand over (chosen)** | Closes file creation and target steering. Files opened from the desktop or a terminal never ask | One question per file opened through quick open, Recent files, a link or a drop; one more field in the session |
| Text check + ask on every Ctrl+E | Strongest, nothing to remember | A question on every edit, including files the reader just opened from Files |
| Text check only | Smallest change | A page can steer Ctrl+E to any text file open in the window |
| Text check + a 1 s wait shown in the window title | Main-only, no dialog | The Linux title isn't drawn on screen, so the reader would never see it |
| Text check + a desktop notification on each grant | Doesn't block | Only visible after the fact, and prevents nothing |

## Consequences

### Positive

- A compromised page can no longer create a file, or get a file into edit mode that the reader
  didn't hand over or confirm by name.
- The rule about what can be edited is enforced in main, where the write happens.

### Negative

- Files opened through quick open, Recent files, links or drops ask once before their first edit.
- A downgrade to 0.1 drops the session: 0.1 rejects the new field.

### Accepted residual risk (T6)

A fully compromised page can still write the one file the reader put in edit mode, while it is in
edit mode. It can also show a confirmation the reader might accept without reading the path.
Exfiltration stays blocked (SR-04, SR-06, SR-12).

## Revisit triggers

- Readers find the question gets in the way, for example for files opened through quick open.
- The app gains a native Open dialog (its files would count as handed over).
