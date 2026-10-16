# ADR-018 — Rich views and the format descriptor: JSON tree, CSV table, highlighted source

- Status: Accepted (2026-10-15; owner added split view for CSV/TSV and raised the table limits; the
  table's time budget and Render anyway for tables superseded by [ADR-020](ADR-020-table-budget-and-show-as-table.md))
- Date: 2026-10-15
- Deciders: project owner
- Builds on: [ADR-003](ADR-003-rendering-pipeline-and-format-registry.md) (the format registry
  and the render worker), [ADR-013](ADR-013-edit-and-save-model.md) (edit mode),
  [ADR-014](ADR-014-split-view-and-scroll-sync.md) (split), [ADR-004](ADR-004-security-and-zero-network.md)
  (hostile content), UX F14 ([UX](../design/ux.md)), PRD "User Stories — v0.3"
  ([PRD](../PRD.md)). Supersedes nothing.

## Context

v0.3 opens JSON as a tree, CSV and TSV as a table, and YAML, TOML and source code as highlighted,
foldable source (PRD v0.3 stories 1–3, UX F14). Today all of these open as `plain`: read-only
CodeMirror with no highlighting.

ADR-003 describes one descriptor per format, so that adding a format doesn't touch the tab or
window code. What was built is thinner:

- The core registry (`FormatSpec`) has extensions, a default view, a render limit and
  `capabilities {follow, outline, split}`, but nothing reads `capabilities`.
- The page decides per format in code: which formats render in the worker, which have a reader,
  a split, an outline, follow mode, a source language, and the words in the split refusal.
- The page can't import `core` (imports point inward: renderer → shared), so the registry as it
  stands can't be the page's source of truth.

The decisions below set where each part of the descriptor lives, which formats v0.3 adds, where
their parsing runs, and their limits.

## Decision

### The descriptor, split by layer

ADR-003's descriptor fields stay; each lives in the layer that uses it:

| Part | Layer | Holds |
|---|---|---|
| Detection and limits | `core` (main reads the file) | extensions, name matches, default view, render limit |
| View capabilities | `shared` (main and page) | `rendered: 'worker' \| 'host' \| 'none'`, `reader`, `split`, `outline`, `follow`, `editable` |
| Loaders | `renderer` | the source language (lazy), the rendered view's host component (lazy) |

Adding a format means one entry in each table. The page derives every per-format behaviour (which
views exist, split, outline, follow, the status bar's view name, the refusal texts) from the
shared entry; no `format === …` checks remain in the document pane.

Detection stays by **extension and file name** (for example `Dockerfile`, `Makefile`, rotated
`.log.1`). ADR-003's MIME and content sniffing are not built: nothing in v0.3 needs them, and a
later ADR can add them.

### New formats

| Format | Files | Opens as | Rendered view |
|---|---|---|---|
| `json` | `.json` | tree | host |
| `jsonl` | `.jsonl`, `.ndjson` | source, highlighted as JSON per line | none (a tree per line can come later) |
| `yaml` | `.yaml`, `.yml` | source with an outline of top-level keys | none |
| `toml` | `.toml` | source with an outline of top-level keys and tables | none |
| `csv`, `tsv` | `.csv`, `.tsv` | table (split with the source while editing) | host |
| `code` | a table of common source extensions and names | source | none |

`code` is one format: its language comes from the extension table on the page side, which also
drives grammar loading. Source code gets **no outline** in v0.3 (folding covers it); a symbol
outline can follow if it proves useful.

YAML and TOML are **never parsed**: no YAML or TOML dependency, nothing to exploit (as for
frontmatter in ADR-003). Their outline comes from the CodeMirror syntax tree.

### Where parsing runs

- **JSON**: the render worker runs `JSON.parse` and sends back a compact node index (type, key,
  child count, preview, source position), bounded by the limits below. The tree on the UI thread
  builds elements only for expanded nodes. A parse error comes back with its position; the tab
  opens in the source view with the "Not valid JSON" banner, cursor at the error.
- **CSV/TSV**: an own RFC 4180 parser in `shared` (quotes, embedded line breaks, CRLF, a byte order
  mark, ragged rows; `;` recognised in a `.csv` by sniffing the first lines), run in the worker.
  The worker sends the field boundaries back as offsets into the text (a transferable typed
  array), not as millions of small strings; each row keeps the source line it starts on. The table draws only the rows in view, so a
  dataset of many rows scrolls as smoothly as a small file.
- Both stay off the UI thread for the same reason as Markdown (ADR-003): a large file must not
  block scrolling or tab switching. They share the worker's render budget and "Too slow to
  render" fallback. *(Tables: own budget, superseded by ADR-020.)*

### Limits

Starting values, confirmed or adjusted by the performance harness when the views are built
(changing a number does not need a new ADR):

| View | Opens as source with the "too large" banner above | Shows part, with a notice, above |
|---|---|---|
| JSON tree | 10 MB, or 200,000 nodes | — |
| CSV/TSV table | 100 MB | 1,000,000 rows ("Showing N of M rows") |

Nesting deeper than 1,000 levels is treated as too large. *(For tables, superseded by ADR-020: "Show as table".)* "Render anyway" stays a Markdown action
(UX states): past these limits the source view is the answer.

### Views and modes

- **Ctrl+U** toggles between the tree or table and the highlighted source, keeping the place
  (node path or row ⇄ line).
- **Split** is for Markdown and MDX (ADR-014) and for **CSV/TSV**: the table beside its source, so
  a dataset can be edited quickly and checked as a table. Scroll sync maps rows to source lines
  (each row keeps its first line, as Markdown blocks keep `data-src-line`); while editing, the
  table follows the typed text with ADR-014's debounced preview. JSON doesn't split in v0.3 (its
  tree has no line-ordered layout to sync); for it and the source-only formats Ctrl+\ is refused
  with a message naming the format.
- **Edit mode** (ADR-013) works for every text format and always edits the source; leaving it or
  saving refreshes the tree or table. `editable` exists so a future view of non-text content can
  opt out.
- **Live reload** keeps the place by node path or row.

### Security

The new parsers read hostile input (threat model T1):

- JSON keys such as `__proto__` and `constructor` are data: the node index uses arrays and
  `Object.create(null)` maps, never assignment onto plain objects.
- Depth and size limits as above; values are shown as text, never as HTML; nothing is evaluated.
- The CSV parser is linear in the input and has no backtracking regular expressions.

The threat model and the security review of v0.3 cover these parsers.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Descriptor split by layer (core / shared / renderer)** | Respects the import rule; the page and main agree on capabilities from one table | Three small tables per format instead of one object | **Chosen** |
| One descriptor in `shared` with lazy loaders | One place | Loaders would pull renderer code into `shared`, which main also imports | Rejected |
| Keep per-format checks in the page | No change now | Every new format edits the pane; the core capabilities stay dead code | Rejected |
| Parse JSON on the UI thread | Simpler; no message format | A 10 MB file blocks the page | Rejected |
| Parse YAML/TOML for a tree | Same view as JSON | Needs a parser dependency (`yaml` was rejected); more attack surface | Rejected for v0.3 |
| A CSV library (e.g. Papa Parse) | Mature | A new dependency for ~150 lines of well-specified parsing | Rejected; revisit if the own parser proves fragile |

## Consequences

### Positive
- New formats touch the registry tables and their own view, not the tab or pane code.
- JSON stays responsive at the sizes agents and tools produce, and CSV at dataset sizes.
- No new parsing dependency.

### Negative
- Three tables to keep in step; a test checks every format has an entry in each.
- The worker grows a second and third kind of request (JSON, CSV) beside Markdown.

### Risks
- **The limits are guesses until measured.** Mitigation: the performance harness gains large JSON
  and CSV cases before release.
- **Memory on large datasets.** A 100 MB file is held as text once more on the page.
  Mitigation: offsets instead of strings, only visible rows drawn; the memory gate in the
  performance harness gets a large-CSV case.
- **CSV dialects** beyond `,`/`;`/tab are shown with the wrong columns. Mitigation: Ctrl+U shows the
  raw text; a separator choice can come later.

## Revisit triggers
- A format needs MIME or content detection (for example an extensionless JSON file).
- The performance harness shows the tree or table over budget within the limits.
- YAML or TOML users ask for a tree view.
