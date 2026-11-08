# ADR-033 — Incremental reads of a growing file

- Status: Accepted (2026-11-07, owner)
- Date: 2026-11-07
- Deciders: project owner
- Builds on: [ADR-013](ADR-013-edit-and-save-model.md) (versions and save conflicts),
  [ADR-030](ADR-030-change-marks.md) (change marks), [ADR-024](ADR-024-find-in-all-tabs.md) (decoding off
  main's thread). Supersedes nothing.
- Issue: [#42](https://github.com/SWEStash/galeo/issues/42)

## Context

When an open file changes, main tells the page (`tabs.stale`) and the page asks for the document again
(`documents.read`). Main reads the whole file, decodes it, hashes it (the version a save names, ADR-013) and
sends all of its text; the page copies the editor's whole text out and compares it character by character to
replace only what differs (`diffSpan`). For a 100 MB log that grows by a few lines, that is ~1.7 s per change
(`logFollowMs` 1609–1762 ms, 2026-10-26), nearly all of it spent on bytes that didn't change. Reads already
overtaken by a newer change still run, and can overlap.

A plain "the file grew, so read only its end" is wrong: an editor that saves in place and inserts a line in the
middle also makes the file longer, on the same inode, and the end alone would show the wrong text and a wrong
version. The answer has to be exact for any change.

## Options

| Option | Exact | Cost per change (100 MB) | Verdict |
|---|---|---|---|
| **Main compares the new bytes with the bytes it last sent; same start → send only the rest** | Yes: a byte-for-byte compare | Read + compare (tens of ms) + the new bytes | **Chosen** |
| Read only the end while following, with periodic full reads | No: a mid-file insert shows wrong text until the next full read | Smallest | Rejected |
| The page checks `startsWith` on the full text | Yes | Still reads, decodes, hashes and sends the whole file | Rejected: saves the least |

## Decision

1. **The page says what it holds.** `documents.read(id, held)` names the version the page shows (`null` for
   none). Main never guesses what the page has.
2. **Main keeps the bytes it last sent**, per tab: the bytes, their version, and the SHA-256 state after them.
   Only for files of 1 MiB or more (below that a full read is cheap), and at most 512 MiB for all tabs
   together; the copy read least recently goes first. Without a copy, a read is a full read. A tab's copy goes
   when the tab closes, hibernates or shows another file.
3. **An append reply when, and only when, the start is unchanged.** Main reads the whole file, as today. If
   `held` is the copy's version, the file is at least as long, and its first bytes equal the copy byte for
   byte, main decodes only the new bytes and replies `{ state: 'appended', base, text, size, version }`;
   otherwise it replies with the full document, as today, and keeps the new bytes as the copy. The version is
   the SHA-256 of the whole new file, computed by continuing the saved state with the new bytes: the same
   value a full read gives, so saves and their conflict checks (ADR-013) don't change.
4. **Decoding stays exact.** The new bytes are decoded in the copy's encoding, and only when that gives the
   same text a full decode would: never for UTF-32 or a guessed encoding; for UTF-8 only if the new bytes are
   valid on their own (decoded with `fatal`); for UTF-16 only from an even offset; never when the shown text
   ends in U+FFFD (a write caught mid-character). Any other case is a full read.
5. **One read at a time per tab.** A request that arrives while a read runs waits for it, then reads once
   more; requests in between share that one read. Reads never overlap or pile up.
6. **The page applies an append only to the text it holds.** If it still shows `base`, it joins the new text
   to its own, and the source view inserts it at the end without copying or comparing the document; views
   that render (Markdown, tables) take the joined text as a new text, as today. If the page no longer shows
   `base`, it asks again with `held = null`.

## Consequences

### Positive
- A followed 100 MB log costs a read and a compare per change instead of a decode, a hash, a 100 MB message
  and a full-text compare. Target: a new line shows within 0.5 s (`logFollowMs` tightened from 2000 ms).
- Exact for any change: a mid-file edit, a truncation or a rewrite fails the byte compare and becomes a full
  read.
- Versions and saves are unchanged.

### Negative
- Main holds a copy of each large file it serves, up to 512 MiB in total.
- A second reply shape in `documents.read`, and the page keeps both paths.
- The whole file is still read on each change; a later step could read only the end once the start is known
  unchanged by identity (inode, size), which this ADR doesn't do.

## Security

- **SR-11:** `held` is a version string, validated by schema; it is only compared with the tab's own copy, in
  the sender window. A wrong or stale `held` gets a full read, never another file's bytes.
- **SR-14:** the copies are bounded (512 MiB in total, files of 1 MiB or more only, least recently read
  first), and one read at a time per tab bounds the work a fast-changing file can cause.
- The append is decided by an exact byte compare, so no text is shown that the file doesn't hold.

## Revisit triggers
- Memory pressure from the copies (lower the cap, or keep hashes of blocks instead of bytes).
- Reading the whole file dominates the remaining cost (read only the end, checked by identity).
