# ADR-021 — Table options: separator and header, per tab, and any text as a table

- Status: Accepted (2026-10-16)
- Date: 2026-10-16
- Deciders: project owner
- Builds on: [ADR-018](ADR-018-rich-views-and-the-format-descriptor.md) (the CSV/TSV table),
  [ADR-020](ADR-020-table-budget-and-show-as-table.md) (its budget), [ADR-005](ADR-005-profiles-and-session-persistence.md)
  (settings and the session), [ADR-002](ADR-002-window-and-tab-model.md) (the tab record). Supersedes
  nothing; it widens ADR-018's "`;` recognised in a `.csv` by sniffing".

## Context

The table reads a `.csv` as `,` or `;` (sniffed), a `.tsv` as tab, and always takes the first row as
the header. Real files break both: pipe-separated exports, a `;` file whose first lines are mostly
numbers with decimal commas, data with no header row, and CSV-shaped text in files whose extension
says nothing (`.txt`, `.dat`, `.log`). The reader has no way to say "this file is `|`-separated" or
"there is no header". The owner asked for both (2026-10-16), with automatic detection as the default.

What exists: tabs already keep their view, follow mode and split ratio across restarts (the tab's
view state in the session, ADR-005), as zoom does; Settings has validated fields; the status bar's
encoding menu is the pattern for "reopen this document differently".

## Decision

1. **Separators**: `,` `;` tab and `|`. **Auto** (the default) picks among them from the first lines,
   outside quotes: the one found most, a comma on a tie. `.tsv` stays tab unless the reader picks
   another.
2. **Header**: "First row is a header", on by default. Off, the columns are numbered (1, 2, 3…) and the
   first row is data.
3. **Per tab**: the reader's choice is part of the tab's view state, kept across restarts like the
   view and zoom; a tab without a choice of its own follows the defaults.
4. **Defaults in Settings** (global and per profile, as other settings): *Table separator* (Auto,
   Comma, Semicolon, Tab, Pipe) and *First row is a header*.
5. **Where the reader chooses**: a **Table options** item in the status bar while a table shows,
   reading its choice (`; · Header`), opening a small menu (separator choices, the header toggle,
   "Reset to defaults"), as the encoding menu does; and palette commands for the keyboard (*Table
   separator: …* for each separator, *First row is a header*). A change reads the table again and
   keeps the place.
6. **Other files as tables**: `.psv` opens as a table (Auto finds the pipe). For any other text file,
   the palette's **Show as table** shows it as a table, a choice kept with the tab like the others;
   Ctrl+U goes back to its source.
7. Nothing new crosses a process boundary but bounded values: the view-state and settings schemas
   gain enums and a boolean, validated as the rest (SR-11, SR-17).

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Status-bar menu + palette, per tab, Settings defaults** | Where the encoding choice already is; one file's quirk stays with it; keyboard and pointer both | A status-bar item and three palette commands | **Chosen** |
| A toolbar above the table | Always visible | Takes height from every table to change something rarely changed; galeo has no toolbars | Rejected |
| A dialog on open ("How should this file be read?") | Explicit | A question before every CSV, most of which Auto reads right | Rejected |
| Per-extension rules only (Settings: `.csv` = `;`) | No UI on the table | A file that doesn't follow its extension's rule can't be fixed | Rejected (Settings defaults kept) |
| A fixed `;` default | Fits `;` files | Every comma CSV, the common case from tools, shows as one column | Rejected (owner: Auto) |

## Consequences

### Positive
- Pipe, semicolon, headerless and odd-extension data open as tables, and stay right after a restart.
- The defaults cover a reader whose files all share a convention.

### Negative
- The tab's view state and Settings grow; old sessions and settings read as "no choice", so nothing
  migrates.
- "Show as table" gives a tab a view its format doesn't have by itself, which the page must honour
  (the status bar, Ctrl+U, split) as it does for CSV.

### Risks
- **Auto picks wrong** on a short file or one with many commas inside unquoted text. Mitigation: the
  choice is one click away and kept.
