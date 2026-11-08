# ADR-034 — Watching a folder

- Status: Accepted (2026-11-07, owner)
- Date: 2026-11-07
- Deciders: project owner
- Builds on: [ADR-002](ADR-002-window-and-tab-model.md) (windows, sessions), [ADR-004](ADR-004-security-and-zero-network.md)
  (main decides, input credits), [ADR-005](ADR-005-profiles-and-session-persistence.md) (sessions). Supersedes
  nothing.
- Design: [watch-folder.md](../design/watch-folder.md). Issue: [#49](https://github.com/SWEStash/galeo/issues/49)

## Context

Agents and builds write reports into a folder; today each one has to be found and opened by hand. galeo grants
access file by file: main reads a file only after the user named it (argv, Open With, a drop, quick open, a
link it checked; SR-12). Watching a folder widens that to "the files that appear in this folder", so the grant,
what main may do with it, and its limits need deciding before the build.

## Options

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A folder grant held by main: it lists names, opens only what the user picks** | Reads stay one file at a time, on request; the page never names a path | Main walks and watches a tree | **Chosen** |
| Main opens each new file itself (no list) | Simplest UI | Reads files nobody asked for; a busy folder floods the tabs | Rejected (prototype direction C) |
| The page asks main to list any folder | Flexible | A page could enumerate the disk (SR-12) | Rejected |

## Decision

1. **The grant.** A window watches at most one folder. Only the user grants it: `galeo --watch <dir>` (argv
   handled as data, SR-13), or *Watch folder…* in the palette, which opens main's folder dialog and spends an
   input credit (ADR-004). Main resolves the path (`realpath`) and keeps it with the window; the page gets an
   opaque grant, never a path to send back.
2. **What main may do with it.** List the folder and its subfolders to 4 levels, skipping the quick-open skip
   list and never entering symlinked folders; `stat` entries for size and time. It reads no file content for
   the list. An entry whose real path leaves the folder is never listed.
3. **What the page gets.** Per entry: an id, the file name, its folder relative to the watched one, *new* or
   *changed*, and the time. Opening sends the id; main maps it to its path and opens it through the normal open
   path, as a quick-open result. Unknown or stale ids are refused.
4. **Watching.** Main records the files present when watching starts (the quick-open walker: at most 50,000
   files and 3 s; past that only later changes are classified), then watches the folder and each subfolder
   through the coalescing watcher, at most 1,000 folders; past that, or where watching fails, it polls. Events
   are coalesced as for open files. Only types galeo opens are listed, at most 200 entries per window, newest
   first.
5. **Sessions.** The watched folder is saved with its window (ADR-005), validated on load (SR-17: an absolute
   path to an existing folder), and watched again on restore; the list starts empty.
6. **Ending.** *Stop watching*, closing the window or watching another folder drops the grant, the watches and
   the ids.

## Consequences

### Positive
- New reports are one click away, and galeo still reads only what the user opens.
- The page never handles paths: the grant and the ids live in main (SR-12).

### Negative
- Main walks and watches a tree: bounded (decision 4), but more inotify watches than open files alone use.
- The file names in the watched folder reach the page, as quick open's do for a repository.

## Security

- **SR-12:** the grant comes only from argv or main's dialog with an input credit; listing stays inside the
  real path of the folder; opening goes by id through the normal open path.
- **SR-13:** `--watch <dir>` takes the next argument as a path; files still follow `--`.
- **SR-14:** walk (50,000 files, 3 s), folders watched (1,000, then polling), entries (200) and the coalescing
  watcher's rate bound the work a busy folder can cause.
- **SR-17:** the session's watched folder is validated on load; an invalid one is dropped.

## Revisit triggers
- Users ask for several folders per window, or for files present before watching started.
- Watch limits hit in practice (raise the folder cap, or watch recursively where the system allows).
