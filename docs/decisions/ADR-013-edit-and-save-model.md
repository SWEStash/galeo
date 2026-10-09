# ADR-013 — Edit and save: a main-held edit grant, checked atomic saves, unsaved text kept in memory

- Status: Accepted (2026-10-08); amended in place the same day to match the build (owner), see
  "Amendment" at the end
- Date: 2026-10-08
- Deciders: project owner
- Builds on: [ADR-004](ADR-004-security-and-zero-network.md) (verified capabilities: "Enable edit
  mode", "Write a file"), [Architecture §5.5](../ARCHITECTURE.md), SR-15 and SR-16 in the
  [threat model](../security/threat-model.md), UX F12 ([UX](../design/ux.md)). Supersedes nothing.
- Related: [ADR-002](ADR-002-window-and-tab-model.md) (tab states),
  [ADR-007](ADR-007-platform-seam.md) (the `FileSystem` port)

## Context

v0.2 lets the user edit any text file as raw text and save it (PRD "Edit mode"). The written
rules already fix the frame: edit mode is enabled only by a key or menu item main sees itself,
never by a page message (ADR-004); a write needs that grant and a conflict check, is atomic,
goes through symlinks and keeps mode and ownership (SR-15); no document content is ever stored
in state files (SR-16).

What exists in v0.1 and falls short:

- The source view is CodeMirror, read-only, with no undo history and no change listener.
- `FileSystem.writeFileAtomic` (temp file, `fsync`, rename, directory `fsync`) is used for
  settings only. The rename replaces a symlink with a plain file, and `FileStat` carries no mode
  or owner, so neither can be kept.
- A file's identity is `inode:size:mtime`; SR-15 asks for a content hash as well.
- Decoding keeps the detected encoding but drops the byte-order mark, so the same bytes can't be
  written back.
- Live reload replaces the source text on any outside change, which would discard edits.
- Closing a tab, a window, the app or a profile asks nothing.
- When a window's renderer crashes, main reloads it with its tabs hibernated: any unsaved text
  would be lost.

This ADR settles those gaps. It does not cover split view ([ADR-014](ADR-014-split-view-and-scroll-sync.md)).

## Decision

### Edit grant

- Main keeps a set of edit-enabled tabs (the "Capability checker" in the architecture). Ctrl+E in
  main's `before-input-event` hook, or the matching native menu item, toggles the active tab's
  grant and tells the page. The page can ask to *leave* edit mode (it only removes a grant); it
  can never ask to enter it.
- A grant belongs to one tab and one file. Closing the tab or navigating it to another file
  clears it; the file going missing doesn't, so unsaved text can be saved again. Grants are never
  saved in the session: every tab reopens read-only.
- Only a file with content can be edited: an empty file shows its empty state, and Ctrl+E says it
  can't be edited (its type can't be told from its bytes, and a misnamed empty file of another
  kind would get text written into it).
- Leaving edit mode with unsaved changes is the page's choice to offer (UX F12: save or discard);
  main clears the grant only once the page says the text is clean or discarded.

### Save

- `documents.save(tabId, text, base)` is a new request channel: zod-validated, from the window's
  main frame only, and it spends an input credit (Ctrl+S is a real key press main sees). `base` is
  the identity the page loaded. The text is capped at the read limit.
- Main checks, in order: the tab is edit-enabled; the path is the tab's own; the file's current
  identity equals `base`. Otherwise it answers `conflict` (with the current identity) or
  `refused`, and writes nothing.
- **Identity** gains a content hash (SHA-256 of the bytes main read) next to inode, size and
  mtime. The hash is the authority: an mtime-only touch is not a conflict; a same-size, same-mtime
  rewrite is.
- **Encoding**: the text is encoded back to the encoding the file was read with, with the same
  byte-order mark, and with the line endings the file had (LF, or CRLF when the file used CRLF).
  A file read as "guessed" Windows-1252 is saved as Windows-1252; the encoding menu's "Reopen
  with encoding…" choice is the encoding of record. Characters the encoding can't hold refuse the
  save with a message naming the first one; nothing is written.
- **How it writes**, on the file's real path (`realpath`, so a symlink is written through and stays
  a symlink):
  - *Atomic* (the normal case): temp file in the same folder, created with the file's mode, owner
    kept when the process may set it, `fsync`, rename over the target, `fsync` the folder.
  - *In place* when an atomic rename would change something the user relies on: the file has
    more than one hard link, or it belongs to another user and we can't give the temp file that
    owner. Main then writes the bytes into the existing file (`O_TRUNC`, write, `fsync`). Not
    atomic, so it happens only in these cases.
  - A file the user can't write is refused, though a rename in its folder would replace it, and
    so is a folder we can't create files in: a clear error, and the edits stay in the editor.
- After a successful write, main records the new identity as the one the tab loaded **before**
  the watcher reports the change, so the app's own save is not seen as an outside change. The
  page shows "Saved".

### External changes

- While a tab is clean, an outside change reloads it as in v0.1, in edit mode too.
- While a tab has unsaved changes, main still sends `tabs.stale`, but the page keeps the editor's
  text and shows the non-modal "File changed on disk" bar: **Show diff**, **Keep mine**, **Load
  theirs**. *Keep mine* adopts the new identity as `base` (the next save overwrites with the
  user's knowledge). *Load theirs* replaces the text. *Show diff* opens a read-only diff of mine
  against theirs, drawn with `@codemirror/merge` (CodeMirror's own merge view, from the same
  maintainers as the editor packages we ship).
- A file deleted while dirty shows the same bar with *Save again* instead of *Load theirs*.

### Unsaved changes on close and quit

- The page tracks dirty state per tab and reports it to main (`documents.dirty(tabId, dirty)`);
  the tab shows `●` (UX). A tab with unsaved changes is never hibernated: that would unmount its
  editor, and the edits with it.
- Closing a dirty tab asks *Save / Don't save / Cancel* in the page.
- Window close (Ctrl+Shift+W, the window manager), app quit and profile delete are decided in
  main: if any affected tab is dirty, main cancels the close, brings that window forward, and
  asks the page to run the same dialog for each dirty tab, then retries. Quit already waits for
  async work in `before-quit`; it waits for these answers too.
- The answer has two steps: the page says it is *asking* within 5 s, or the close counts as
  Cancel (a hung page can't hang a quit); the reader then takes as long as they like to choose.

### Unsaved text across a renderer crash

- While a tab is dirty, the page sends its text to main about 1 s after typing stops. Main holds
  it **in memory only**, per tab, and drops it on save, discard, or tab close. It is never written
  to disk, so SR-16 is unchanged. Text typed in the last second before a crash is lost.
- After a renderer crash, the reloaded window restores each dirty tab's text from main, marked
  unsaved, with its original `base`; tabs that were in edit mode with nothing kept come back
  read-only (main drops their grants). If the app itself dies, unsaved text is lost: that is the
  cost of keeping document content out of state files.

## Options considered

| Option | Why not |
|---|---|
| Page writes through a generic file API | Breaks ADR-004's verified-capability model: a compromised page could write anywhere it can name |
| Identity by mtime only (no hash) | Misses same-second rewrites and reports touches as conflicts; SR-15 asks for both |
| Always atomic rename | Silently breaks hard links and hands another user's file to us; a reader who saved one line would not expect that |
| Always write in place | A crash mid-save leaves a half-written file, which SR-15 rules out for the normal case |
| Save unsaved text to a recovery file | Puts document content in state files, against SR-16; the owner's files are often under version control, and an in-memory copy covers the crash we know happens (renderer) |
| A self-written diff for *Show diff* | More code and tests to own; the merge view is maintained by the same people as the editor and needs no extra rendering code |

## Consequences

### Positive

- The write path stays in main, behind the same checks as every other capability, and the page
  never names a path.
- Saved files keep their bytes' shape: encoding, byte-order mark, line endings, mode, symlinks
  and hard links.
- A renderer crash, the one crash v0.1 already recovers from, no longer loses edits.

### Negative

- One new dependency (`@codemirror/merge`) and a hash of every file main reads (cheap next to
  reading it; files over the render limit are hashed too, as they can be edited).
- The page now sends document text to main on save and while dirty; channel limits must match
  the read cap.
- A process crash in main still loses unsaved text.

### Risks

- The close/quit round trip between main and pages is new and must not hang a quit: a page that
  doesn't say it is asking within 5 s is treated as "Cancel" for that window, and the user sees
  the window that needs them.
- Editing a 5 MB+ file in CodeMirror is untested; the read limits stay as they are and the e2e
  covers the largest file the render limit allows.

## Revisit triggers

- A request to edit binary or non-text formats.
- Auto-save or recovery across app crashes becomes a requirement (needs a new SR-16 decision).
- macOS/Windows support (ADR-011): ownership, links and atomic replace differ there.

## Amendment (2026-10-08, owner)

Amended in place the day it was accepted, before any release, to match what was built (owner's
choice for this ADR; the convention is a superseding ADR):

- A grant survives the file going missing, so *Save again* has a grant to save with.
- The close question is answered in two steps (*asking* within 5 s, then the reader's choice);
  the first wording would have cancelled a reader still deciding.
- A file the user can't write is refused rather than replaced.
- A tab with unsaved changes is never hibernated; tabs in edit mode with no kept text come back
  read-only after a crash.
- Empty files can't be edited (owner, for now).
- The page reports unsaved state on `documents.dirty`, and hands its text over only after typing
  pauses.

