# Harbor — v1 "catalogue" Execution Plan

## 1. Context

Harbor is a desktop catalogue for small libraries: a parish reading room, a school library with one
part-time librarian, a club that lends board games. Today these places keep their catalogue in a
spreadsheet, a paper ledger, or both. v1 delivers the catalogue itself: items, copies, members,
loans, returns, a fast search, printable labels and an offline-first data file that a volunteer can
copy to a USB stick. v2 (circulation reports and a public read-only view) is planned separately,
after v1 has run for one full school term in at least two pilot libraries.

**Intended outcome of v1**: a volunteer with no training can add a book, lend it, take it back and
find it again in under two minutes on first use; the data file survives a power cut mid-write;
every screen works with the keyboard alone; and the installer ships for Linux, macOS and Windows.

### Pilot libraries

The parish reading room lends about 4 000 books, mostly donated, to around 150 members. Two
volunteers cover three afternoons a week. Their catalogue is a spreadsheet that one of them
maintains at home and brings in on a USB stick; loans go in a paper ledger and are copied into the
spreadsheet "when there is time", which in practice means at the end of each month. Overdue
reminders are phone calls made from the ledger. They want, above all, to stop copying the ledger
by hand, and to find out quickly whether a book that a member asks about is on the shelf.

The school library holds about 9 000 items, including class sets of novels, a small collection of
science kits and two shelves of board games for wet lunchtimes. A part-time librarian works two
days a week; on the other days, older pupils run the desk at lunchtime. The school's management
system has a library module that nobody uses because it needs a login per pupil and a network
connection the library corner does not reliably have. They want a desk that pupils can run after
five minutes of explanation, and an overdue list the librarian can print for form tutors.

The club library lends about 300 board games to its members on club nights. Its "catalogue" is a
shared document with one row per game and a column that says who has it. It joined the pilot late
and is not part of the acceptance criteria, but its needs shaped two decisions: equipment and games
are first-class item kinds, and the shelf map export exists because the club publishes a floor plan
of its cupboard on its website.

### What success looks like after one term

Volunteers stop keeping the paper ledger in parallel with Harbor, at the latest after the first
month. The overdue list replaces the phone-call sheet. A member's question, "do you have this?",
is answered from the search box while they wait. Nobody has to ask the developers how to make a
backup, because the app makes one on every quit and the guide says where it is. And when a
volunteer leaves, the next one learns the desk from the one-page guide and a short demonstration,
not from a handover of personal habits.

## 2. Source documents

| Doc | Status |
|---|---|
| `docs/requirements.md` | **Approved** after the second pilot interview round |
| `docs/design/screens.md` | **Approved**, with the loan screen redrawn after usability test 2 |
| `docs/architecture.md` | Draft; the storage section is final, the sync section is v2 |
| `docs/decisions/0001-local-first-storage.md` | Accepted |
| `docs/decisions/0002-sqlite-with-wal.md` | Accepted |
| `docs/decisions/0003-search-index.md` | Accepted |
| `docs/decisions/0004-ui-toolkit.md` | Accepted |
| `docs/decisions/0005-label-printing.md` | Proposed until the printer survey ends |
| `docs/decisions/0006-import-formats.md` | Accepted |
| `docs/decisions/0007-backup-and-restore.md` | Accepted |
| `docs/security.md` | Draft; covers the data file, imports and printing |
| `docs/glossary.md` | Living document |
| `docs/pilots.md` | Two pilot sites confirmed, a third pending |

## 3. Decisions already made

| Area | Decision | Record |
|---|---|---|
| Storage | One SQLite file per library, WAL mode, fsync on commit; no server in v1 | 0001, 0002 |
| Search | A full-text index inside the same file, rebuilt in the background after imports | 0003 |
| UI | A native-feeling desktop shell; keyboard first; system fonts; light and dark themes | 0004 |
| Labels | Print through the system dialog; a label sheet is an SVG page, never a driver-specific format | 0005 |
| Imports | CSV and MARC21 in v1; a mapping preview before anything is written | 0006 |
| Backups | A dated copy beside the data file on every quit, keeping the last 14 | 0007 |
| Identifiers | Copies get a short barcode-friendly code; items keep their ISBN when they have one | screens.md §4 |
| Members | Name plus an optional contact; no birth dates, no addresses, no photos | requirements.md §6 |
| Diagrams | The shelf map export writes Mermaid text; Harbor never renders it itself | requirements.md §9 |
| Network | None in v1: no update check, no telemetry, no cover downloads | security.md §2 |
| Licences | MIT for the app, CC BY for the sample catalogue | — |

### Why local-first, and why one file

Every pilot has at least one day a week without a working network at the desk, and none of them
has anyone who could run a server. A catalogue that lives in one file can be copied, backed up,
emailed to a helper and opened on another machine, which matches how these libraries already work
with their spreadsheets. SQLite gives that file transactions, an integrity check and a backup API,
and its format is stable across the three platforms. The cost is that two machines cannot edit the
same catalogue at once; both pilots run a single desk, and v2's read-only public view covers the
"can I see the catalogue from home?" request without multi-writer sync.

### Why no network at all in v1

Cover images, ISBN lookups and update checks were all suggested, and all were left out. Each one
would add a network path that has to be explained to the pilots' administrators, fail gracefully
when the connection drops, and be described in a privacy notice. Without them, the privacy notice
is one sentence: Harbor never sends anything anywhere. The network harness keeps that sentence true
as features are added, because a new outbound call fails the test suite before it can ship.

## 4. Scope

### In scope (v1)

- Items (books, games, equipment) with any number of copies; members; loans with due dates;
  returns; holds on items with no copy on the shelf.
- Search across titles, authors, subjects, codes and member names, with results while typing.
- CSV and MARC21 import with a preview; CSV export of every table.
- Label sheets for copies (code, short title, shelf mark) on common A4 and Letter sheets.
- A shelf map export as Mermaid text, for libraries that publish a floor plan on their own site.
- Overdue list, printable and exportable; nothing is sent anywhere.

### Out of scope (v1)

- Any server, sync, or multi-device editing (v2 looks at a read-only public view first).
- Fines and payments. Pilot libraries were unanimous: they do not charge.
- Cover images. They need the network or a scanner, and neither pilot asked for them.
- Self-service kiosks and barcode scanners beyond "a scanner that types like a keyboard".
- Rendering the shelf map. The export is text; a mermaid renderer on the library's site draws it.

## 5. Release acceptance criteria (v1 is done when)

1. A first-time volunteer adds an item, lends a copy, returns it and finds it again in under two
   minutes, unaided, in both pilot libraries (screen recording kept with consent).
2. Pulling the power during a burst of 500 loan writes never leaves a file that fails the integrity
   check; at most the last unconfirmed write is lost.
3. Search returns the first results in under 80 ms on a 50 000-item catalogue on the reference
   laptop, and typing never stalls the input.
4. Importing the 12 000-record MARC21 sample shows its preview in under 3 s and writes it in under 20 s.
5. Every screen passes the keyboard-only walkthrough and the automated contrast and label checks.
6. The installer runs on the three platforms; the app opens a catalogue copied from another
   platform without a migration step.
7. No outbound connection is made during the full end-to-end suite (checked by the network harness).
8. Label sheets print aligned to within 1 mm on the four sheet types the pilots use.
9. The sample catalogue, the user guide and the release notes are in the release.

## 6. Tasks

Effort: S ≈ half a day, M ≈ two days, L ≈ a week. "Done when" is the check the task closes on.

### A — Foundations (repository, tooling, first build)

| ID | Task | Eff | Depends | Done when |
|---|---|---|---|---|
| A1 | Repository, licence, README stub, issue templates, editor config | S | sign-off | First commit has `docs/` and the licence; CI runs on every push |
| A2 | Toolchain: strict type checking, formatter, linter, unit test runner | S | A1 | `make check` runs all four and fails on a seeded error in each |
| A3 | App shell that opens an empty window and quits cleanly | M | A2 | Window opens on the three platforms in CI; quit leaves no process behind |
| A4 | Data layer: open/create a catalogue file, WAL, migrations table | M | A2 | Unit tests create, reopen and migrate a file; a corrupt header is refused |
| A5 | Network harness: fail any test that opens a socket | S | A3 | A seeded `fetch` call fails the suite with the caller's stack |
| A6 | Packaging skeleton: installers built in CI, unsigned | M | A3 | Three installers attached to the CI run; each opens the app |
| A7 | Performance harness: timed scenarios with a JSON report | M | A4 | Report lists p50/p95 per scenario; a budget breach fails the run |
| A8 | Fixture catalogues: empty, 50 items, 50 000 items, damaged | S | A4 | Fixtures are generated by a script, never edited by hand |

### B — Items and copies

| ID | Task | Eff | Depends | Done when |
|---|---|---|---|---|
| B1 | Item model: title, authors, subjects, kind, ISBN, notes | M | A4 | Round-trip tests for every field; ISBN-10 and ISBN-13 both validated |
| B2 | Copy model: code, shelf mark, condition, status | S | B1 | Codes are unique per catalogue; a deleted copy keeps its loan history |
| B3 | Item form with inline validation and keyboard order | M | B1, A3 | Keyboard walkthrough passes; errors are announced and linked to fields |
| B4 | Copy list on the item screen, with add/retire actions | M | B2, B3 | Retiring a copy on loan is refused with a clear reason |
| B5 | Duplicate detection on save (same ISBN, or same title + author) | S | B1 | A likely duplicate offers "open existing" before saving |
| B6 | Subjects as free tags with suggestions from existing ones | S | B1 | Suggestions appear within one keystroke; no subject list to maintain |

### C — Members, loans and returns

| ID | Task | Eff | Depends | Done when |
|---|---|---|---|---|
| C1 | Member model: name, optional contact, notes, active flag | S | A4 | No other personal field exists in the schema (checked by a test) |
| C2 | Lend flow: pick member, scan or type a copy code, confirm | M | B2, C1 | Lending three copies to one member takes under 20 s in the usability test |
| C3 | Return flow: scan a code from any screen | M | C2 | Returning works without first opening the member or the item |
| C4 | Due dates with a per-kind default (books 3 weeks, games 1 week) | S | C2 | Defaults live in settings; changing them never rewrites existing loans |
| C5 | Holds: queue members on an item with no copy on the shelf | M | C2 | A return of a held item shows the next member before shelving |
| C6 | Overdue list, sortable, printable, exportable as CSV | M | C4 | The printed list fits A4 portrait for 40 rows |
| C7 | Loan history per member and per copy, with a privacy switch | S | C2 | With the switch on, history older than 30 days is erased nightly |

### D — Search

| ID | Task | Eff | Depends | Done when |
|---|---|---|---|---|
| D1 | Full-text index over items, copies and members | M | B1, C1 | Index rebuild of the 50 000-item fixture under 10 s |
| D2 | Search box with results while typing, grouped by kind | M | D1, A3 | First results under 80 ms p95 on the reference laptop |
| D3 | Query syntax: quoted phrases, `author:`, `subject:`, `code:` | S | D1 | Each prefix has unit tests, including an unknown prefix as plain text |
| D4 | Accent- and case-insensitive matching | S | D1 | "Garcia" finds "García"; "ÉTÉ" finds "été" |
| D5 | Background reindex after imports, with progress | S | D1, E2 | The app stays usable during a reindex; progress is announced |

### E — Import and export

| ID | Task | Eff | Depends | Done when |
|---|---|---|---|---|
| E1 | CSV import with column mapping and a preview of 20 rows | M | B1 | A mapping mistake is visible in the preview before anything is written |
| E2 | MARC21 import of the common fields, with a skipped-fields report | L | B1 | The 12 000-record sample imports with a report of what was left out |
| E3 | CSV export of every table | S | B1, C1 | Re-importing an export recreates the same catalogue |
| E4 | Shelf map export as Mermaid text | S | B2 | The output parses with the reference mermaid parser in the test suite |
| E5 | Import guard: size limit, encoding detection, formula-injection escape | S | E1 | A cell starting with `=` is escaped on export and shown as text on import |

### F — Labels and printing

| ID | Task | Eff | Depends | Done when |
|---|---|---|---|---|
| F1 | Label layout as an SVG page for four sheet types | M | B2 | Each sheet type matches its template within 0.5 mm in the SVG |
| F2 | Print through the system dialog; no driver-specific code | S | F1 | Printed test sheets aligned within 1 mm on two pilot printers |
| F3 | Choose copies to label: new since last print, a shelf, a selection | S | F1 | "New since last print" is remembered per catalogue |
| F4 | Code font check: the code stays readable at 7 pt | S | F1 | Pilot volunteers read 20 random codes without a mistake |

### G — Hardening and release readiness

| ID | Task | Eff | Depends | Done when |
|---|---|---|---|---|
| G1 | Power-cut test: kill the process during 500 writes, 200 times | M | A4, C2 | Integrity check passes every time; at most one write lost |
| G2 | Accessibility pass on every screen | M | all screens | Keyboard walkthrough and automated checks pass; screen reader notes recorded |
| G3 | Performance pass against the budgets | M | A7, D2 | Every scenario under budget on the reference laptop |
| G4 | Security review of imports, printing and the data file | M | E5, F2 | Findings triaged; none above medium left open |
| G5 | User guide, sample catalogue, release notes | M | all | A volunteer follows the guide from install to first loan unaided |
| G6 | Signed installers and checksums | S | A6 | Checksums verified on a clean machine for each installer |

### H — Settings, backups and restore

| ID | Task | Eff | Depends | Done when |
|---|---|---|---|---|
| H1 | Settings screen: library name, loan defaults, label sheet, theme, privacy switch | M | A3, C4 | Every setting has a keyboard path and a plain-language description; nothing needs a restart |
| H2 | Settings stored inside the catalogue file, not in the user profile | S | A4 | Copying the file to another machine keeps the library's settings; per-user display settings stay local |
| H3 | Dated backup on quit, keeping the last 14, using the SQLite backup API | M | A4 | A backup taken during a write is a valid catalogue; the 15th backup removes the oldest one only |
| H4 | Restore from a backup with a preview of its counts and date | M | H3 | Restoring never overwrites the current file without first backing it up as well |
| H5 | "Where is my data?" screen with the file path and an "open folder" action | S | H3 | The pilots' volunteers find the backup folder from the screen alone in the usability test |
| H6 | Low-disk warning before a backup or import | S | H3, E1 | Below 200 MB free, the app warns and offers to skip the backup instead of failing |
| H7 | Settings export and import as a small text file, for libraries with two machines | S | H1 | Importing the file on the second machine changes only the settings it lists |

### I — Accessibility, language and help

| ID | Task | Eff | Depends | Done when |
|---|---|---|---|---|
| I1 | Focus order and visible focus on every screen, checked by the walkthrough helper | M | A3 | The walkthrough helper records the same order as the design document for every screen |
| I2 | Screen reader names and live announcements for lend, return and search results | M | C2, C3, D2 | A screen reader user completes a lend and a return in the usability test without sighted help |
| I3 | Contrast and text size: the app follows the system text size up to 200 % | S | A3 | No clipped text or overlapping controls at 200 % on any screen |
| I4 | Interface text in a message catalogue, English and Spanish in v1 | M | A3 | Switching language changes every visible string; a missing string fails the build |
| I5 | Help pages inside the app, one per screen, readable without a network | S | I4 | Each screen's help opens with F1 and returns focus to where it was |
| I6 | Keyboard shortcuts list, searchable, printable | S | I1 | The printed list fits one A4 page and matches the shortcuts the app actually binds |
| I7 | Reduced motion: no animation when the system asks for none | S | A3 | With reduced motion on, list updates and dialogs appear without transitions |

### J — Pilot rollout

| ID | Task | Eff | Depends | Done when |
|---|---|---|---|---|
| J1 | Pilot build channel: installers from the main branch, labelled "pilot" | S | A6 | Both pilot machines install the pilot build without administrator help |
| J2 | Import each pilot's existing catalogue with them, on site | M | E1, E2 | Both pilots confirm their counts match their ledgers within a handful of items |
| J3 | Two-week check-in per pilot: what they did, what they avoided, what broke | S | J2 | Notes from both pilots are in `docs/pilots.md`, with each problem linked to an issue |
| J4 | Usability test 3 with volunteers who have never seen Harbor | M | G2 | Acceptance criterion 1 met in both libraries |
| J5 | Problem-report path: a "copy diagnostics" button that copies versions and counts, never data | S | A3 | The copied text has no titles, names or codes, only versions, counts and timings |
| J6 | Release candidate on both pilot machines for one full week before release | S | G6 | No new issue above low severity during the week |

## 7. Test strategy

### 7.1 Layers

| Layer | Runs | Covers |
|---|---|---|
| Unit | Every save, in watch mode | Models, validation, query parsing, import mapping, label geometry |
| Data | Every push | Real SQLite files: migrations, WAL recovery, integrity checks, backups |
| UI component | Every push | Forms, lists, dialogs in isolation with a fake data layer |
| End to end | Every push, three platforms | Real app, real file: lend, return, search, import, print to PDF |
| Performance | Nightly and before release | Timed scenarios on the fixtures; budgets fail the run |
| Network | Every end-to-end run | Any socket fails the test that opened it |

### 7.2 Must-cover behaviours (failure branches included)

- Opening a file that is not a catalogue, a catalogue from a newer version, and a damaged one.
- Lending a copy that is already on loan, retired, or held for someone else.
- Returning a code that does not exist, and a code typed with a trailing space.
- Importing a CSV with a byte-order mark, mixed line endings, and a 40 MB file.
- A MARC21 record with a missing title, and one with a title longer than 2 000 characters.
- Search with an empty query, a query of only punctuation, and a 500-character query.
- Printing when no printer is installed: the dialog says so and offers "save as PDF".
- Quitting during an import: the import stops cleanly and the catalogue is unchanged.
- A Mermaid shelf map for a library with no shelves, and one with 300 shelves.
- The disk filling up during a backup: the previous backup stays intact.

### 7.3 Fixtures and helpers

- Catalogue fixtures are generated by `scripts/make-fixtures` from a seed, so they never drift.
- A fake clock for due dates and the nightly erase; tests never sleep.
- A printing helper that captures the SVG page instead of sending it to a printer.
- Import samples: `csv/` (clean, BOM, semicolons, quoted newlines, formula cells),
  `marc/` (the 12 000-record sample, a damaged record, an empty file).
- A keyboard walkthrough helper that tabs through a screen and records the focus order.

### 7.4 Performance harness

- Scenarios: open the 50 000-item catalogue; first search results; lend 20 copies; import the MARC
  sample; print 10 label sheets to PDF.
- Each scenario runs 15 times after 3 warm-up runs; the report keeps p50 and p95.
- Budgets live in one file next to the scenarios and are reviewed at each release.
- The reference laptop is a five-year-old mid-range machine, chosen because the pilots have one.

### 7.5 Network harness

- Wraps every socket API in the test process and fails on the first call.
- Runs in every end-to-end test, not as a separate suite, so a new feature cannot skip it.
- Allows one exception: the local test printer spooler, by path, never by port.

### 7.6 Quality bars

- No skipped tests on the main branch; a flaky test is fixed or deleted the same week.
- Coverage is reported, not gated; the must-cover list above is the real bar.
- Every bug fix starts with a failing test that reproduces it.

## 8. Per-milestone closing loop

1. Work the milestone's tasks in small batches, each closed by its "done when" check.
2. Tidy the milestone diff: dead code, debug output, stray files.
3. Self-review against the decision records and the security notes.
4. Fresh CI run on all three platforms; performance and network results attached to the status note.
5. Update the status note at the top of this plan and write a short handoff if work stops
   mid-milestone.

### Status note format

The status note at the top of the plan is short on purpose: one line per milestone, saying what
is done, what was checked and how, and what comes next. "Done" always comes with the check that
proved it, for example "D2 done: first results 61 ms p95 on the reference laptop". Anything else
is written as not done, with the reason beside it, so that nobody reads "almost there" as a
promise. Handoffs follow the same format, plus the exact command to resume from.

## 9. Dependency map and critical path

```
sign-off ─► A1 ─► A2 ─┬─► A3 ─┬─► A5 ─► A6
                      │       └─► A7
                      └─► A4 ─┬─► A8
                              ├─► B1 ─┬─► B2 ─┬─► B4
                              │       │       ├─► C2 ─┬─► C3
                              │       │       │       ├─► C4 ─► C6
                              │       │       │       ├─► C5
                              │       │       │       └─► C7
                              │       │       ├─► E4
                              │       │       └─► F1 ─┬─► F2
                              │       │               ├─► F3
                              │       │               └─► F4
                              │       ├─► B3
                              │       ├─► B5
                              │       ├─► B6
                              │       ├─► D1 ─┬─► D2
                              │       │       ├─► D3
                              │       │       └─► D4
                              │       └─► E1 ─┬─► E5
                              │               └─► E2 ─► D5
                              └─► C1
all of the above ─► G1 … G6 ─► release
```

**Critical path**: sign-off → A1–A4 → B1 → B2 → C2 → C4 → C6 → G2 → G5 → release. Import (E2) is
the longest single task but runs beside the loan work; it only joins the critical path if the
MARC21 sample turns up encodings the plan did not expect.

**Parallel lanes once B1 lands**: search (D), import/export (E) and labels (F) can each be worked
without waiting on loans (C). Hardening (G) starts only when every screen exists.

| Lane | Starts after | Longest task | Can slip by |
|---|---|---|---|
| Loans (C) | B2, C1 | C2 (M) | 0 days: critical path |
| Search (D) | B1, C1 | D1 (M) | 4 days |
| Import/export (E) | B1 | E2 (L) | 2 days |
| Labels (F) | B2 | F1 (M) | 6 days |
| Hardening (G) | all screens | G1 (M) | 0 days |

### Notes on the lanes

The loan lane carries the most risk to the schedule because every screen after it assumes that a
copy can be lent and returned. It is also the lane where the usability tests found the most
problems, so its tasks are kept small and each one ends with a short session with a volunteer
rather than only with automated checks. The import lane has the single largest task, but its
risk is in the data, not in the code: once the MARC21 sample imports, the pilots' own exports are
expected to behave, and J2 exists to find out on site whether they do.

The label lane looks independent but has a hidden dependency on the pilots' printers, which cannot
be borrowed. Its "done when" checks are split so that the SVG geometry can be finished and tested
without a printer, and the physical alignment check waits for a visit. The search lane is the
least risky: the index is a well-understood feature of the storage engine, and the budget has
headroom on the reference laptop with the 50 000-item fixture.

## 10. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MARC21 records from the pilots use legacy encodings | High | Medium | Detect MARC-8 and convert; report every record that could not be converted |
| A pilot printer misaligns labels beyond 1 mm | Medium | Medium | Per-sheet offset setting, measured once with a test sheet |
| Volunteers expect a barcode scanner to "just work" | Medium | Low | Document keyboard-wedge scanners; test two cheap models |
| Data file copied while the app is writing | Medium | High | Backups use the SQLite backup API; the guide says to copy the dated backup |
| Search slows down past 50 000 items | Low | Medium | Performance harness has a 100 000-item scenario as an early warning |
| A third pilot site does not join | Medium | Low | Two pilots are enough for the acceptance criteria |
| The UI toolkit lacks an accessible table | Medium | High | Prototype the loan table first; fall back to a list with headings |
| Formula injection through CSV exports | Medium | Medium | Escape on export (E5); a test opens the export in a spreadsheet engine |
| Mermaid syntax changes and breaks the shelf map export | Low | Low | Pin the parser version in the test; the export uses only basic flowchart syntax |
| Volunteers lose the data file | Medium | High | Dated backups on quit; the guide's first page says where they are |

### Risk narrative

The risks that matter most are the ones where a volunteer loses work or trust. Losing the data
file is the worst outcome, which is why backups are automatic and the guide's first page shows
where they are; the power-cut test protects the file against the most likely accident, which is a
laptop that runs out of battery during a busy afternoon. A label sheet that prints out of line is
annoying but recoverable; a member's name appearing in a diagnostics report would not be, which
is why J5 copies counts only and the security review checks that the copied text never contains
catalogue data.

Some risks were accepted rather than mitigated. Two machines editing copies of the same file will
produce two diverging catalogues; v1 says so in the guide and offers no merge. Pilots that keep a
second machine are asked to treat one of them as the desk and the other as a backup reader. The
Mermaid export may draw differently on different sites, depending on the renderer they use; Harbor
only promises that the text parses, and keeps to the oldest, most widely supported syntax.

## 11. Open questions (answer when the owning task starts)

| Question | Owning task | Leaning |
|---|---|---|
| Should a member be deletable while they have loan history? | C1 | Anonymise instead of delete |
| One catalogue per library, or several in one file? | A4 | One per file; simpler backups |
| Which label sheet sizes beyond the pilots' four? | F1 | Wait for requests after release |
| Do holds expire? | C5 | After 14 days on the shelf, with a setting |
| Should search include retired copies? | D2 | Only with `status:retired` |
| What does "kind" cover beyond books, games and equipment? | B1 | A free list with those three as defaults |
| Should the overdue list group by member or by due date? | C6 | By due date, with the member's other overdue items on the same row |
| Is Spanish enough as the second language, or do the pilots need Catalan too? | I4 | Spanish in v1; the message catalogue makes Catalan a contribution, not a task |
| Should backups be compressed? | H3 | No: a backup that opens as a normal catalogue is worth the disk space |
| How much of a MARC21 record is worth keeping beyond the common fields? | E2 | Keep the raw record beside the item so nothing is lost, show only the common fields |
| Does the shelf map need shelf capacity, or only the layout? | E4 | Layout only in v1; capacity is a v2 report |
| Should label sheets print a library logo? | F1 | No: it costs label space and no pilot asked for it |

## 12. Drift log

| When | Task | What changed | Why |
|---|---|---|---|
| Week 1 | A1 | Issue templates moved to A1 from G5 | Pilots wanted to report problems from day one |
| Week 1 | A4 | Migrations table added to A4 instead of a separate task | Needed for the first schema change in B1 |
| Week 2 | A6 | Installers unsigned until G6 | Signing certificates take weeks to arrive |
| Week 2 | B1 | ISBN-10 accepted as well as ISBN-13 | One pilot's ledger is mostly pre-2007 books |
| Week 3 | B5 | Duplicate check on title + author added | Many pilot items have no ISBN |
| Week 3 | C1 | Contact field made optional | Second pilot interview: some members have none |
| Week 4 | C2 | Lend flow starts from the copy as well as from the member | Usability test 1: volunteers scan first |
| Week 4 | C5 | Holds moved into v1 | Both pilots run waiting lists on paper today |
| Week 5 | D2 | Results grouped by kind | Mixed results confused the usability test 2 group |
| Week 5 | D4 | Accent-insensitive matching moved from v2 | First pilot catalogue is half in Spanish |
| Week 6 | E2 | MARC-8 conversion added | Pilot export turned out to be MARC-8, not UTF-8 |
| Week 6 | E4 | Mermaid export limited to flowchart syntax | Keeps the export valid across parser versions |
| Week 7 | F1 | SVG page instead of PDF generation | The system print dialog already produces PDFs |
| Week 7 | F2 | Per-sheet offset setting | One pilot printer feeds 1.5 mm to the left |
| Week 8 | C7 | Privacy switch for loan history | Requested by the school pilot's head teacher |
| Week 8 | G1 | Power-cut test raised from 50 to 200 runs | One failure in 80 runs during a trial; fixed in the WAL setup |
| Week 9 | A7 | 100 000-item scenario added | Early warning for the search budget |
| Week 9 | E5 | Formula escape on export as well as import | Found in the security review draft |
| Week 10 | G5 | Guide written as a single page with screenshots | Pilots printed it and pinned it by the desk |
| Week 10 | H2 | Library settings moved into the catalogue file | A volunteer copied the file home and lost the loan defaults |
| Week 11 | H4 | Restore preview shows counts and the backup's date | A trial restore picked a three-week-old backup by mistake |
| Week 11 | I3 | Text size support raised from 150 % to 200 % | One pilot volunteer reads at 175 % |
| Week 11 | I4 | Message catalogue checked at build time | A missing Spanish string shipped in a pilot build |
| Week 12 | J2 | On-site import sessions instead of remote help | Remote help could not see the pilot's spreadsheet quirks |
| Week 12 | J5 | Diagnostics button copies counts only | A first draft included the last search query, which can contain a member's name |
| Week 12 | D2 | Search waits 40 ms after the last keystroke before querying | The reference laptop dropped keystrokes during the 100 000-item scenario |
| Week 13 | C3 | Return works from the search box as well | Volunteers kept typing the code into search first |
| Week 13 | F3 | "New since last print" stored per catalogue, not per machine | The two-machine pilot printed some labels twice |
| Week 13 | G4 | Import size limit lowered from 200 MB to 50 MB | The security review showed the preview held the whole file in memory |
| Week 14 | I5 | Help pages shortened to one screen each | Pilots never scrolled past the first screen in the usability test |
| Week 14 | J6 | Release candidate week moved after the school holidays | The school pilot is closed for two weeks |

### How to read this log

Each row records a change to the plan after it was approved: what moved, and the evidence that
moved it. Rows are never edited after the fact; if a later change reverses an earlier one, it gets
its own row that says so. The "why" column cites the session or test that produced the evidence,
so that a reader can check whether the reason still holds before reversing a decision. Week
numbers count from the plan's sign-off.

### Status notes

- **Week 14**: foundations, items and copies, members and loans, search, import and export are
  done and checked against their "done when" lines. Labels wait on the second pilot printer.
  Hardening has started with the power-cut test (200 runs, no failure) and the accessibility pass
  (four screens of nine). The plan's critical path still holds; the release candidate week moved
  after the school holidays, which pushes the release by two weeks with the sponsor's agreement.
- **Week 12**: both pilots imported; counts match within six items in the parish library (items
  on the ledger that no longer exist) and exactly in the school library. The shelf map export was
  tried by the club library, which pasted the Mermaid text into its site's page; the mermaid
  renderer there drew it without changes.
- **Week 8**: loans, returns and holds usable end to end; the usability test 2 group lent and
  returned without help, but two of five volunteers looked for the return action on the member
  screen first. C3 makes it reachable from anywhere; the loan screen redraw follows.
- **Week 4**: the app opens, creates and reopens catalogues on all three platforms; the network
  harness and the performance harness run in CI. Installers are built but unsigned.

## Appendix 1. Test strategy (repeated for size)

### 7.1 Layers

| Layer | Runs | Covers |
|---|---|---|
| Unit | Every save, in watch mode | Models, validation, query parsing, import mapping, label geometry |
| Data | Every push | Real SQLite files: migrations, WAL recovery, integrity checks, backups |
| UI component | Every push | Forms, lists, dialogs in isolation with a fake data layer |
| End to end | Every push, three platforms | Real app, real file: lend, return, search, import, print to PDF |
| Performance | Nightly and before release | Timed scenarios on the fixtures; budgets fail the run |
| Network | Every end-to-end run | Any socket fails the test that opened it |

### 7.2 Must-cover behaviours (failure branches included)

- Opening a file that is not a catalogue, a catalogue from a newer version, and a damaged one.
- Lending a copy that is already on loan, retired, or held for someone else.
- Returning a code that does not exist, and a code typed with a trailing space.
- Importing a CSV with a byte-order mark, mixed line endings, and a 40 MB file.
- A MARC21 record with a missing title, and one with a title longer than 2 000 characters.
- Search with an empty query, a query of only punctuation, and a 500-character query.
- Printing when no printer is installed: the dialog says so and offers "save as PDF".
- Quitting during an import: the import stops cleanly and the catalogue is unchanged.
- A Mermaid shelf map for a library with no shelves, and one with 300 shelves.
- The disk filling up during a backup: the previous backup stays intact.

### 7.3 Fixtures and helpers

- Catalogue fixtures are generated by `scripts/make-fixtures` from a seed, so they never drift.
- A fake clock for due dates and the nightly erase; tests never sleep.
- A printing helper that captures the SVG page instead of sending it to a printer.
- Import samples: `csv/` (clean, BOM, semicolons, quoted newlines, formula cells),
  `marc/` (the 12 000-record sample, a damaged record, an empty file).
- A keyboard walkthrough helper that tabs through a screen and records the focus order.

### 7.4 Performance harness

- Scenarios: open the 50 000-item catalogue; first search results; lend 20 copies; import the MARC
  sample; print 10 label sheets to PDF.
- Each scenario runs 15 times after 3 warm-up runs; the report keeps p50 and p95.
- Budgets live in one file next to the scenarios and are reviewed at each release.
- The reference laptop is a five-year-old mid-range machine, chosen because the pilots have one.

### 7.5 Network harness

- Wraps every socket API in the test process and fails on the first call.
- Runs in every end-to-end test, not as a separate suite, so a new feature cannot skip it.
- Allows one exception: the local test printer spooler, by path, never by port.

### 7.6 Quality bars

- No skipped tests on the main branch; a flaky test is fixed or deleted the same week.
- Coverage is reported, not gated; the must-cover list above is the real bar.
- Every bug fix starts with a failing test that reproduces it.

## Appendix 2. Test strategy (repeated for size)

### 7.1 Layers

| Layer | Runs | Covers |
|---|---|---|
| Unit | Every save, in watch mode | Models, validation, query parsing, import mapping, label geometry |
| Data | Every push | Real SQLite files: migrations, WAL recovery, integrity checks, backups |
| UI component | Every push | Forms, lists, dialogs in isolation with a fake data layer |
| End to end | Every push, three platforms | Real app, real file: lend, return, search, import, print to PDF |
| Performance | Nightly and before release | Timed scenarios on the fixtures; budgets fail the run |
| Network | Every end-to-end run | Any socket fails the test that opened it |

### 7.2 Must-cover behaviours (failure branches included)

- Opening a file that is not a catalogue, a catalogue from a newer version, and a damaged one.
- Lending a copy that is already on loan, retired, or held for someone else.
- Returning a code that does not exist, and a code typed with a trailing space.
- Importing a CSV with a byte-order mark, mixed line endings, and a 40 MB file.
- A MARC21 record with a missing title, and one with a title longer than 2 000 characters.
- Search with an empty query, a query of only punctuation, and a 500-character query.
- Printing when no printer is installed: the dialog says so and offers "save as PDF".
- Quitting during an import: the import stops cleanly and the catalogue is unchanged.
- A Mermaid shelf map for a library with no shelves, and one with 300 shelves.
- The disk filling up during a backup: the previous backup stays intact.

### 7.3 Fixtures and helpers

- Catalogue fixtures are generated by `scripts/make-fixtures` from a seed, so they never drift.
- A fake clock for due dates and the nightly erase; tests never sleep.
- A printing helper that captures the SVG page instead of sending it to a printer.
- Import samples: `csv/` (clean, BOM, semicolons, quoted newlines, formula cells),
  `marc/` (the 12 000-record sample, a damaged record, an empty file).
- A keyboard walkthrough helper that tabs through a screen and records the focus order.

### 7.4 Performance harness

- Scenarios: open the 50 000-item catalogue; first search results; lend 20 copies; import the MARC
  sample; print 10 label sheets to PDF.
- Each scenario runs 15 times after 3 warm-up runs; the report keeps p50 and p95.
- Budgets live in one file next to the scenarios and are reviewed at each release.
- The reference laptop is a five-year-old mid-range machine, chosen because the pilots have one.

### 7.5 Network harness

- Wraps every socket API in the test process and fails on the first call.
- Runs in every end-to-end test, not as a separate suite, so a new feature cannot skip it.
- Allows one exception: the local test printer spooler, by path, never by port.

### 7.6 Quality bars

- No skipped tests on the main branch; a flaky test is fixed or deleted the same week.
- Coverage is reported, not gated; the must-cover list above is the real bar.
- Every bug fix starts with a failing test that reproduces it.

## Appendix 3. Test strategy (repeated for size)

### 7.1 Layers

| Layer | Runs | Covers |
|---|---|---|
| Unit | Every save, in watch mode | Models, validation, query parsing, import mapping, label geometry |
| Data | Every push | Real SQLite files: migrations, WAL recovery, integrity checks, backups |
| UI component | Every push | Forms, lists, dialogs in isolation with a fake data layer |
| End to end | Every push, three platforms | Real app, real file: lend, return, search, import, print to PDF |
| Performance | Nightly and before release | Timed scenarios on the fixtures; budgets fail the run |
| Network | Every end-to-end run | Any socket fails the test that opened it |

### 7.2 Must-cover behaviours (failure branches included)

- Opening a file that is not a catalogue, a catalogue from a newer version, and a damaged one.
- Lending a copy that is already on loan, retired, or held for someone else.
- Returning a code that does not exist, and a code typed with a trailing space.
- Importing a CSV with a byte-order mark, mixed line endings, and a 40 MB file.
- A MARC21 record with a missing title, and one with a title longer than 2 000 characters.
- Search with an empty query, a query of only punctuation, and a 500-character query.
- Printing when no printer is installed: the dialog says so and offers "save as PDF".
- Quitting during an import: the import stops cleanly and the catalogue is unchanged.
- A Mermaid shelf map for a library with no shelves, and one with 300 shelves.
- The disk filling up during a backup: the previous backup stays intact.

### 7.3 Fixtures and helpers

- Catalogue fixtures are generated by `scripts/make-fixtures` from a seed, so they never drift.
- A fake clock for due dates and the nightly erase; tests never sleep.
- A printing helper that captures the SVG page instead of sending it to a printer.
- Import samples: `csv/` (clean, BOM, semicolons, quoted newlines, formula cells),
  `marc/` (the 12 000-record sample, a damaged record, an empty file).
- A keyboard walkthrough helper that tabs through a screen and records the focus order.

### 7.4 Performance harness

- Scenarios: open the 50 000-item catalogue; first search results; lend 20 copies; import the MARC
  sample; print 10 label sheets to PDF.
- Each scenario runs 15 times after 3 warm-up runs; the report keeps p50 and p95.
- Budgets live in one file next to the scenarios and are reviewed at each release.
- The reference laptop is a five-year-old mid-range machine, chosen because the pilots have one.

### 7.5 Network harness

- Wraps every socket API in the test process and fails on the first call.
- Runs in every end-to-end test, not as a separate suite, so a new feature cannot skip it.
- Allows one exception: the local test printer spooler, by path, never by port.

### 7.6 Quality bars

- No skipped tests on the main branch; a flaky test is fixed or deleted the same week.
- Coverage is reported, not gated; the must-cover list above is the real bar.
- Every bug fix starts with a failing test that reproduces it.

## Appendix 4. Test strategy (repeated for size)

### 7.1 Layers

| Layer | Runs | Covers |
|---|---|---|
| Unit | Every save, in watch mode | Models, validation, query parsing, import mapping, label geometry |
| Data | Every push | Real SQLite files: migrations, WAL recovery, integrity checks, backups |
| UI component | Every push | Forms, lists, dialogs in isolation with a fake data layer |
| End to end | Every push, three platforms | Real app, real file: lend, return, search, import, print to PDF |
| Performance | Nightly and before release | Timed scenarios on the fixtures; budgets fail the run |
| Network | Every end-to-end run | Any socket fails the test that opened it |

### 7.2 Must-cover behaviours (failure branches included)

- Opening a file that is not a catalogue, a catalogue from a newer version, and a damaged one.
- Lending a copy that is already on loan, retired, or held for someone else.
- Returning a code that does not exist, and a code typed with a trailing space.
- Importing a CSV with a byte-order mark, mixed line endings, and a 40 MB file.
- A MARC21 record with a missing title, and one with a title longer than 2 000 characters.
- Search with an empty query, a query of only punctuation, and a 500-character query.
- Printing when no printer is installed: the dialog says so and offers "save as PDF".
- Quitting during an import: the import stops cleanly and the catalogue is unchanged.
- A Mermaid shelf map for a library with no shelves, and one with 300 shelves.
- The disk filling up during a backup: the previous backup stays intact.

### 7.3 Fixtures and helpers

- Catalogue fixtures are generated by `scripts/make-fixtures` from a seed, so they never drift.
- A fake clock for due dates and the nightly erase; tests never sleep.
- A printing helper that captures the SVG page instead of sending it to a printer.
- Import samples: `csv/` (clean, BOM, semicolons, quoted newlines, formula cells),
  `marc/` (the 12 000-record sample, a damaged record, an empty file).
- A keyboard walkthrough helper that tabs through a screen and records the focus order.

### 7.4 Performance harness

- Scenarios: open the 50 000-item catalogue; first search results; lend 20 copies; import the MARC
  sample; print 10 label sheets to PDF.
- Each scenario runs 15 times after 3 warm-up runs; the report keeps p50 and p95.
- Budgets live in one file next to the scenarios and are reviewed at each release.
- The reference laptop is a five-year-old mid-range machine, chosen because the pilots have one.

### 7.5 Network harness

- Wraps every socket API in the test process and fails on the first call.
- Runs in every end-to-end test, not as a separate suite, so a new feature cannot skip it.
- Allows one exception: the local test printer spooler, by path, never by port.

### 7.6 Quality bars

- No skipped tests on the main branch; a flaky test is fixed or deleted the same week.
- Coverage is reported, not gated; the must-cover list above is the real bar.
- Every bug fix starts with a failing test that reproduces it.

## Appendix 5. Test strategy (repeated for size)

### 7.1 Layers

| Layer | Runs | Covers |
|---|---|---|
| Unit | Every save, in watch mode | Models, validation, query parsing, import mapping, label geometry |
| Data | Every push | Real SQLite files: migrations, WAL recovery, integrity checks, backups |
| UI component | Every push | Forms, lists, dialogs in isolation with a fake data layer |
| End to end | Every push, three platforms | Real app, real file: lend, return, search, import, print to PDF |
| Performance | Nightly and before release | Timed scenarios on the fixtures; budgets fail the run |
| Network | Every end-to-end run | Any socket fails the test that opened it |

### 7.2 Must-cover behaviours (failure branches included)

- Opening a file that is not a catalogue, a catalogue from a newer version, and a damaged one.
- Lending a copy that is already on loan, retired, or held for someone else.
- Returning a code that does not exist, and a code typed with a trailing space.
- Importing a CSV with a byte-order mark, mixed line endings, and a 40 MB file.
- A MARC21 record with a missing title, and one with a title longer than 2 000 characters.
- Search with an empty query, a query of only punctuation, and a 500-character query.
- Printing when no printer is installed: the dialog says so and offers "save as PDF".
- Quitting during an import: the import stops cleanly and the catalogue is unchanged.
- A Mermaid shelf map for a library with no shelves, and one with 300 shelves.
- The disk filling up during a backup: the previous backup stays intact.

### 7.3 Fixtures and helpers

- Catalogue fixtures are generated by `scripts/make-fixtures` from a seed, so they never drift.
- A fake clock for due dates and the nightly erase; tests never sleep.
- A printing helper that captures the SVG page instead of sending it to a printer.
- Import samples: `csv/` (clean, BOM, semicolons, quoted newlines, formula cells),
  `marc/` (the 12 000-record sample, a damaged record, an empty file).
- A keyboard walkthrough helper that tabs through a screen and records the focus order.

### 7.4 Performance harness

- Scenarios: open the 50 000-item catalogue; first search results; lend 20 copies; import the MARC
  sample; print 10 label sheets to PDF.
- Each scenario runs 15 times after 3 warm-up runs; the report keeps p50 and p95.
- Budgets live in one file next to the scenarios and are reviewed at each release.
- The reference laptop is a five-year-old mid-range machine, chosen because the pilots have one.

### 7.5 Network harness

- Wraps every socket API in the test process and fails on the first call.
- Runs in every end-to-end test, not as a separate suite, so a new feature cannot skip it.
- Allows one exception: the local test printer spooler, by path, never by port.

### 7.6 Quality bars

- No skipped tests on the main branch; a flaky test is fixed or deleted the same week.
- Coverage is reported, not gated; the must-cover list above is the real bar.
- Every bug fix starts with a failing test that reproduces it.

## Appendix 6. Test strategy (repeated for size)

### 7.1 Layers

| Layer | Runs | Covers |
|---|---|---|
| Unit | Every save, in watch mode | Models, validation, query parsing, import mapping, label geometry |
| Data | Every push | Real SQLite files: migrations, WAL recovery, integrity checks, backups |
| UI component | Every push | Forms, lists, dialogs in isolation with a fake data layer |
| End to end | Every push, three platforms | Real app, real file: lend, return, search, import, print to PDF |
| Performance | Nightly and before release | Timed scenarios on the fixtures; budgets fail the run |
| Network | Every end-to-end run | Any socket fails the test that opened it |

### 7.2 Must-cover behaviours (failure branches included)

- Opening a file that is not a catalogue, a catalogue from a newer version, and a damaged one.
- Lending a copy that is already on loan, retired, or held for someone else.
- Returning a code that does not exist, and a code typed with a trailing space.
- Importing a CSV with a byte-order mark, mixed line endings, and a 40 MB file.
- A MARC21 record with a missing title, and one with a title longer than 2 000 characters.
- Search with an empty query, a query of only punctuation, and a 500-character query.
- Printing when no printer is installed: the dialog says so and offers "save as PDF".
- Quitting during an import: the import stops cleanly and the catalogue is unchanged.
- A Mermaid shelf map for a library with no shelves, and one with 300 shelves.
- The disk filling up during a backup: the previous backup stays intact.

### 7.3 Fixtures and helpers

- Catalogue fixtures are generated by `scripts/make-fixtures` from a seed, so they never drift.
- A fake clock for due dates and the nightly erase; tests never sleep.
- A printing helper that captures the SVG page instead of sending it to a printer.
- Import samples: `csv/` (clean, BOM, semicolons, quoted newlines, formula cells),
  `marc/` (the 12 000-record sample, a damaged record, an empty file).
- A keyboard walkthrough helper that tabs through a screen and records the focus order.

### 7.4 Performance harness

- Scenarios: open the 50 000-item catalogue; first search results; lend 20 copies; import the MARC
  sample; print 10 label sheets to PDF.
- Each scenario runs 15 times after 3 warm-up runs; the report keeps p50 and p95.
- Budgets live in one file next to the scenarios and are reviewed at each release.
- The reference laptop is a five-year-old mid-range machine, chosen because the pilots have one.

### 7.5 Network harness

- Wraps every socket API in the test process and fails on the first call.
- Runs in every end-to-end test, not as a separate suite, so a new feature cannot skip it.
- Allows one exception: the local test printer spooler, by path, never by port.

### 7.6 Quality bars

- No skipped tests on the main branch; a flaky test is fixed or deleted the same week.
- Coverage is reported, not gated; the must-cover list above is the real bar.
- Every bug fix starts with a failing test that reproduces it.
