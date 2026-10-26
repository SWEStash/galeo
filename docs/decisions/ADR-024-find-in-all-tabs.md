# ADR-024 — Find in all tabs

- Status: Accepted (2026-10-22, owner)
- Date: 2026-10-22
- Deciders: project owner
- Builds on: [ADR-004](ADR-004-security-and-zero-network.md) (main's task worker, capability-scoped reads),
  [ADR-002](ADR-002-window-and-tab-model.md) (tabs belong to one window, windows to one profile),
  [ADR-013](ADR-013-edit-and-save-model.md) (unsaved text kept in main). Supersedes nothing.

## Context

PRD v0.4 story 4 asks for a search across every tab in a window:
- Ctrl+Shift+F searches the **source text** of the window's tabs.
- Unsaved tabs are searched as they are in the editor.
- The work happens off the main thread, and a newer query cancels the old one.
- Results show each tab with its count and a few matching lines. Choosing one opens the tab with its find bar
  on the match.
- Nothing crosses windows or profiles.

The PRD makes this a *Could Have*, on condition that it is fast and simple.

Today the window's text is spread out:
- The page holds only the text of tabs that are rendered. Hibernated tabs hold nothing.
- Unsaved text lives in the page's editor. Main holds a copy for crash recovery, sent about a second after
  typing stops, or at once on request (`keepNow`).
- Main can read any tab's file. It already did, to show the tab.

A measurement with 10 tabs of 10 MB each, on a loaded machine, gave:
- Copying the text into the page and on to a worker costs about 0.4 s for the copy alone, plus Electron's
  IPC copy, and leaves 100 MB+ in the page.
- Reading and searching in main's worker costs about 0.7 s per query. Only 12–23 KB of results come back.
- Hashing the bytes, as a document read does, would add about 1 s.
- Case-insensitive matching with a literal `RegExp` (`gi`) beats lowercasing the text first, and keeps no
  copy of it.

## Decision

1. **Main searches, one tab at a time, in its task worker.**
   - The page sends the query: `documents.findAll(query, { caseSensitive })`.
   - Main lists the sender window's open tabs, in tab order, except the Settings tab.
   - For each tab it gets the text, then runs a `findInText` job on the existing task worker (ADR-004).
   - When every tab is done, it answers once with the results.
   - Nothing runs at start: the job is registered in the worker, which starts on first use.
2. **Where each tab's text comes from:**
   - A tab with unsaved changes is searched in the text main keeps for it. Before sending a query, the page
     flushes its editors' unsaved text (`keepNow`), so the search sees what is on screen.
   - Every other tab is read from disk by main, through its file-system port, under the 256 MiB read cap.
     The tab's chosen encoding is used if it has one; otherwise the usual detection applies. The text is not
     hashed.
   - A tab whose file is missing, unreadable, binary or too large is listed as *not searched*, with the
     reason. Its text is never guessed.
   - The worker gets the decoded text. The text is not cached between queries; the system's file cache
     already makes a second read cheap.
3. **Matching is literal, on the source text.**
   - The search matches case-insensitively by default, with a *Match case* option, like the find bar.
   - Queries shorter than 2 characters return nothing.
   - Each tab is capped at 10,000 matches, the same cap as the find bar, and returns:
     - the count;
     - whether it was capped;
     - its first 20 hits, each with its line number and a snippet of about 40 characters either side, with
       whitespace collapsed.
   - The search covers the source text, not the rendered text. A Markdown tab matches `**bold**`, link
     targets and front matter, which its reader may hide or show differently. The overlay therefore says
     "in source".
4. **A newer query stops the old one.**
   - Main keeps one search number per window. A new query, or an empty one, raises the number.
   - Before each tab, the running search checks the number. If it is stale, the search stops and answers
     *superseded*.
   - So a superseded search runs at most one more tab's work: about 40 ms for 10 MB in the measurement.
   - The page sends an empty query when the overlay closes, so the old search stops.
   - Each tab's job has a 5 s budget. A tab that overruns is *not searched (too slow)*. The worker is
     terminated and started again, as for every task (SR-14).
   - Jobs from other windows, and link checks, run between tabs rather than waiting behind a whole search.
5. **Choosing a result stays in the page.**
   - The overlay (lazy-loaded, `FindAll.tsx`) shows each tab's name, folder, count and hits.
   - Enter or a click activates that tab. The tab is one of the page's own, so main isn't asked.
   - Then the page opens the tab's find bar with the query and its case option already filled in:
     - **Source view**, or edit mode: on the chosen hit's line.
     - **Reader view**: the view is kept, and the find bar lands on the first rendered match in or
       after the block that holds the hit's line (its `data-src-line`), so the one nearest the hit.
       Counts can differ from the source count. (Wording made precise on 2026-10-26, owner; the
       decision is unchanged.)
     - **JSON tree or CSV table**: the tab switches to its source first, since those views have no find.
6. **Trust.**
   - The new channel follows SR-11: the sender must be a galeo main frame, and the query is a string of at
     most 1,024 characters plus a boolean.
   - It answers only from the sender window's own tabs, which already belong to its profile.
   - It reads only files that window already shows (SR-12). It needs no input credit, like `documents.read`,
     since it reveals nothing the page couldn't already read.
   - Its work is bounded: per-tab budgets, caps on counts, hits and snippets, and one live search per
     window (SR-14).

## Options considered

| Option | For | Against |
|---|---|---|
| **Main reads, task worker matches per tab (chosen)** | Only results cross IPC; hibernated tabs need nothing; scoping comes from the sender; no change to the task runner | Unsaved text must be flushed first (`keepNow`); one job per tab |
| Page gathers texts, render worker matches | Unsaved text is already in the page; render jobs already take `AbortSignal` | 100 MB copied twice into the page per search; every hibernated tab means a read |
| Main worker caches texts between queries | About 3× faster per query on huge files | About 100 MB more memory; must invalidate on every edit, save and reload |
| One job for all tabs, cancelled inside the worker | One round trip | The runner gains a cancel message; link checks wait behind a whole search |
| Match in main's own thread | Simplest | 100+ ms stalls of main on large tabs (ADR-004 keeps parsing off it) |
| Search the rendered text | Matches what the reader sees | Needs every tab rendered; the tree and table are virtualised; hibernated tabs have no DOM |

## Consequences

- One new channel, `documents.findAll`, with a zod schema and handler tests: malformed input, a foreign
  sender, and another window's tabs never searched.
- The task worker gains `findInText`, a pure core function with unit tests.
- The find bar can be opened with a query, a case option and a line, through `DocumentHandle`.
- Ctrl+Shift+F and a palette entry open the overlay. UX gains a row for it, and the keyboard map lists it.
- VALIDATION gains a manual Orca row for the overlay.
- The threat model's SR-11, SR-12 and SR-14 text names the channel.

## Revisit triggers

- Regular expressions, whole-word matching or replace across tabs are asked for.
- Searches at real tab sizes feel slow, or results need to arrive tab by tab.
- Search across windows of a profile, or across profiles, is asked for.
