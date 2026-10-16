# ADR-020 — The table's own time budget, "Show as table" past its size limit, and cancelling a render

- Status: Accepted (2026-10-16; owner set the Cancel button at 5 s, and quiet)
- Date: 2026-10-16
- Deciders: project owner
- Supersedes, in [ADR-018](ADR-018-rich-views-and-the-format-descriptor.md): that CSV/TSV tables
  "share the worker's render budget", and that "Render anyway stays a Markdown action". Everything
  else in ADR-018 stands, JSON's limits included.
- Amends: SR-14 in the [threat model](../security/threat-model.md) (time budgets).

## Context

ADR-018 gave CSV/TSV tables the render worker's budget: 2 s, then the worker is replaced and the
tab shows source (SR-14). It also kept "Render anyway" for Markdown: past a format's limit, the
source view was the answer.

That fits a document, which should render at once, but not a dataset. Measured (headless,
2026-10-16): the CSV reader takes about 0.3 s for 50 MB in Node and about 1.1 s for 64.5 MB in the
page, and a 100 MB file runs close to the 2 s budget on a busy machine. Opening a big dataset
taking a few seconds is expected, and stopping it at 2 s turns a slow open into no table at all.
Readers also open datasets larger than the 100 MB default, up to the 256 MB that galeo reads at all
(`READ_MAX_BYTES`), and want them as a table when they ask.

What exists: the core's `chooseView` already lifts any format's render limit when the reader asks
(`renderAnyway`); only the page offers the button for Markdown alone. The worker client already
has two budgets (2 s, and Render anyway's 60 s) and supersedes and replaces jobs per kind.

## Decision

1. **Tables have their own time budget: 30 s** (`TABLE_BUDGET_MS`), enforced as SR-14 enforces
   every budget: past it the worker is replaced and the tab shows source, with the "Too slow"
   banner. The loading skeleton shows meanwhile. Markdown and JSON keep the 2 s budget.
2. **"Show as table"**: a CSV/TSV over the 100 MB default opens as source with "Large file shown as
   source" and a **Show as table** button, as Markdown's Render anyway, up to the 256 MB read cap
   (a larger file isn't read at all). The same button follows a parse that ran over 30 s. Either
   way the reader asked, so the job gets Render anyway's 60 s.
3. **The table's caps stay**: past 1,000,000 rows the rest is counted ("Showing N of M rows"); past
   10,000,000 fields the file is too large for a table. They bound memory, not time.
4. **Tables have their own performance target**, apart from the Markdown budgets: a 100 MB CSV
   paints as a table within 5 s on the reference machine (starting value, set by the performance
   harness; changing the number needs no ADR).
5. JSON is unchanged: past its limits it opens as source, with no button.
6. **Any render can be cancelled.** Once a render has run 5 s, the loading skeleton offers a
   quiet **Cancel** (a text button that doesn't compete with the content arriving; it is still
   reachable by keyboard and named for screen readers). Cancelling a job the worker is working on replaces the worker, as running over the
   budget does (SR-14), so the worker is free at once; a job still waiting is dropped. The tab shows
   source with "Rendering cancelled — showing source" and the way back: Show as table (CSV/TSV),
   Render anyway (Markdown), Try again (JSON). This holds for every format and budget: a 30 s table,
   a 60 s Render anyway, a JSON tree.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Own table budget + Show as table up to the read cap** | A big dataset opens as a table, slowly, as expected; the reader decides past 100 MB; SR-14's bound stays | Two more numbers to keep (30 s, the CSV target); a second meaning of "Render anyway" in the UI | **Chosen** |
| Keep 2 s, raise only the size limit | No new budget | Big files fail at 2 s on a busy machine: the size limit would promise what the budget refuses | Rejected |
| No time budget for tables | Simplest | A stuck or hostile parse holds the worker forever; drops SR-14 for one format | Rejected |
| Cancel only by closing the tab | No new control | A long render the reader regrets holds the window's worker until its budget runs out | Rejected (decision 6) |
| Parse in chunks, show rows as they come | First rows at once | A streaming protocol, partial row counts and sync for one view; more than v0.3 needs | Rejected for v0.3; revisit if 5 s proves too slow |

## Consequences

### Positive
- Datasets up to 256 MB open as tables when the reader asks; up to 100 MB without asking.
- Markdown keeps its tight budget and its performance gates unchanged.
- A long render never holds the reader: Cancel frees the worker and shows the source at once.

### Negative
- The page offers the over-limit button for a second format, labelled for it ("Show as table").
- Up to 30 s of a worker held by one table job; other tabs' renders in that window wait behind it
  (one worker per window, ADR-003), unless the reader cancels it.
- Cancelling the job in progress costs a worker restart (the Markdown pipeline loads again with the
  next article).

### Risks
- **Memory at 256 MB**: the text is held on the page and in the worker, plus offsets. Mitigation:
  the field cap; the memory gate gains a large-CSV case; the reader asked for it.
- **The 5 s target is a guess until measured.** Mitigation: the performance harness sets it before
  release.
