# galeo — validation record

What was checked for a release, how, and the result. Automated checks run in CI and in
`npm run preflight`; the manual ones are done on the reference platform (Ubuntu 26.04 LTS, GNOME,
Wayland) before each release.

## Accessibility (WCAG 2.1 AA)

### Automated

- **axe** (`@axe-core/playwright`) on every surface, in the e2e suite: tab bar, document (prose,
  GFM, code, math, diagrams, a wide scrolling diagram) and source and log views in light and dark,
  document states and banners in both schemes, find bar, quick open, palette, About, outline, the
  viewer (a diagram in both schemes, and an image), Settings, status bar, profile menu and dialogs, empty window,
  settings notices, the sandbox-unavailable window, and the crash-loop message (axe-core run in the
  page through main, as Playwright loses a crashed page).
  Edit mode and split (v0.2): the editor with unsaved changes and its tab, split view (reading
  and editing), a refused save in the status bar, the changed- and deleted-on-disk bars, the
  unsaved-changes question, Show diff, the find bar with its replace row, an MDX article and an
  MDX syntax error, each in both schemes (`accessibility`, `split`, `edit`, `replace` and `mdx`
  specs).
  The drop overlay is decorative (`aria-hidden`); quick open is the keyboard way to open files.
  Reading comfort (v0.3): the status bar showing a tab's reader width, and an open font picker's list,
  in both schemes (`reader-width` and `settings-tab` specs); About opened from the profile menu
  (`profiles` spec). An open picker hides the rest of the page from assistive tech, so axe checks the
  list there and the closed Settings view on its own.
  Moving tabs (v0.3): the *Move tab to window…* list, its first window focused, in both schemes
  (`tab-move` spec).
- **Contrast** (`tests/unit/design/colour-contrast.test.ts`): text tokens at 4.5:1 and focus ring
  and text-field borders at 3:1 on the page and on panels, in both schemes; the 8 accent presets
  at 3:1 on the tab bar; every code-highlighting colour at 4.5:1 on code blocks. Colour in the JSON
  tree and in logs (v0.4): the tree's classes use only checked tokens, and every colour on a log
  line (text, timestamp, keys, its level word) reads at 4.5:1 on the tinted error and warning lines.
  axe on the JSON tree in both schemes (`accessibility` spec).

### Manual (keyboard only, then Orca)

Record the date, the build and the result of each row.

| Check | How | Result |
|---|---|---|
| Open, read and close documents without a mouse | `galeo` a file; Ctrl+P, type, Enter; Ctrl+Tab between tabs; Ctrl+W | Pass (2026-10-06, `.deb`; 0.2.0 `.deb`, 2026-10-15) |
| Every overlay traps focus and gives it back | Ctrl+P, Ctrl+Shift+P, Ctrl+F, Ctrl+Shift+O, About, Settings (Ctrl+,), profile menu (Ctrl+Shift+M): Tab stays inside, Esc returns to the document | Pass (2026-10-06, `.deb`) |
| Focus is always visible | Tab through the tab bar, status bar, Settings and dialogs in light and dark | Pass (2026-10-06, `.deb`) |
| Source and log views scroll by keyboard | Ctrl+U, then Tab into the text; arrows, PgUp/PgDn, Home/End; End follows a log | Pass (2026-10-06, `.deb`) |
| Orca: tabs | Turn Orca on (Super+Alt+S). Open three files, press Ctrl+Tab: Orca says each tab's name and "tab, n of 3"; on a file being rewritten it adds "reloaded from disk", on a deleted one "file missing" | Pass (2026-10-06, `.deb`) |
| Orca: reading a document | Click into a document and use Orca's browse keys: H jumps heading to heading and reads them, L list by list, T to a table (it reads the header cells with each cell), K link by link; a task item reads as "checkbox, checked" plus its text | Pass (2026-10-06, `.deb`) |
| Orca: overlays | Ctrl+P: Orca says "Quick open", then the result count ("3 results"); arrows read each result. Ctrl+Shift+P reads each command with its keys. Ctrl+F, type: it says "n of m". Esc: focus is back on the document | Pass (2026-10-06, `.deb`) |
| Orca: status messages | Save a shown file from an editor: it says "Reloaded". In the palette, choose "Toggle edit mode": it says "Press Ctrl+E" | Pass (2026-10-06, `.deb`) |
| Zoom 200 % | Ctrl++ to 200 % on a long document: no clipped text in the chrome | Pass (2026-10-06, `.deb`) |
| Edit and save without a mouse (v0.2) | Ctrl+E, type, Ctrl+S; Ctrl+E again reads. Ctrl+W, Ctrl+Shift+W, Ctrl+Q and deleting the profile with unsaved changes each ask; Tab moves between Cancel, Don't save and Save; Esc cancels and the caret is back in the editor | Pass (2026-10-15, `.deb` 0.2.0) |
| File changed on disk, by keyboard (v0.2) | With unsaved changes, change the file in another editor: Shift+Tab from the editor reaches Load theirs, Keep mine and Show diff; each choice puts the caret back in the editor. Show diff: Esc returns to its button. With unsaved changes again, delete the file: "File deleted on disk", and Save again writes it back (with nothing unsaved, the tab shows "File not found" and comes back with the file) | Pass (2026-10-15, `.deb` 0.2.0) |
| Split and editor basics by keyboard (v0.2) | Ctrl+\; Tab to the divider, ←/→ move it, Home resets it. Ctrl+H, type, Enter replaces one, Replace all, Ctrl+Z undoes it all. Ctrl+D twice, Shift+Alt+↓, then type at every cursor; Esc leaves one | Pass (2026-10-15, `.deb` 0.2.0) |
| Orca: editing (v0.2) | Ctrl+E then Ctrl+Tab away and back: the tab reads "…, edit mode", and once typed in "…, unsaved changes". Ctrl+S: "Saved". A refused save reads its reason. The changed-on-disk bar reads "File changed on disk"; the unsaved question reads "Save changes to <name>?" and each button | Pass (2026-10-15, `.deb` 0.2.0) |
| Orca: diff, split and replace (v0.2) | Show diff reads "Changes: mine \| theirs", then "Mine (unsaved)" and "Theirs (on disk)" as read-only text. The divider reads "Resize source and preview" with its value as it moves. Replace all reads "Replaced N" once (not twice with the editor's own message). Several cursors: typing reads as usual | Pass (2026-10-15, `.deb` 0.2.0) |
| Orca: search tabs and filling quick open (v0.4) | Close two tabs, Ctrl+Shift+A: Orca says "Search tabs", the count ("4 tabs") and each row's name and folder under "Open tabs" and "Recently closed"; Enter on a closed one brings it back where it was. Ctrl+P, arrow to a result: Orca reads its name and folder, then "Tab fills in its path"; Tab: "Filled ~/…". Home/End move the caret in both fields | Not run (2026-10-21): for the 0.4.0 run |
| Orca: tabs on the left (v0.4) | With *Tabs: Left*: Orca reads the list as vertical tabs ("Open documents") and each row's name, folder and marks; ↑/↓ move between rows. Ctrl+Shift+B: Orca hears "Tab panel collapsed", and the markers still read the full name and folder. The panel button says "Collapse tab panel" / "Expand tab panel" and whether it is expanded; the divider says "Resize tab panel, 220 pixels" and its arrows change the number | Not run (2026-10-22): for the 0.4.0 run |
| Orca: tab overview (v0.4) | Ctrl+Shift+E: Orca says "Tab overview" and the shown tab's card: its name, folder, marks ("unsaved changes"), format, "shown now" and its position ("2 of 5"); the arrows read each card; Delete on an edited card asks first and Cancel goes back to the card; Esc returns to the document | Not run (2026-10-21): for the 0.4.0 run |
| JSON tree and log colours, then Orca (v0.4) | Open a JSON file and a service log, in light and then dark: the tree's keys, numbers, booleans and null in one colour, strings in another, previews muted; the log's timestamps muted, level words in their level's colour, `key=value` keys in colour, error and warning lines faintly tinted. Orca reads each tree row and log line as before ("name: \"galeo\"", the whole line) | Not run (2026-10-26): for the 0.4.0 run |
| Orca: find in all tabs (v0.4) | Ctrl+Shift+F, type a word in three tabs: Orca says "Find in all tabs", then "Searching…" and the total ("6 matches in 3 tabs"); ↓ reads each match with its line and the tab group's name and count; Match case reads as a toggle; Enter shows the tab and Orca reads the find bar with the word and "2 of 3"; Esc returns to the document | Not run (2026-10-26): for the 0.4.0 run |
| Data views by keyboard, then Orca (v0.3) | In a CSV table the arrows move cell to cell and Orca reads each cell; in a JSON tree the arrows expand and collapse items and Orca reads each one | Pass (2026-10-20, `.deb` 0.3.0) |

## Performance

Measured with a [performance run](development.md#performance-runs): medians of 10 runs; a cold start
is a typical launch: galeo not running, its caches from earlier launches kept.

Reference machine: Intel i7-8565U laptop, 45 GB, Ubuntu 26.04, on AC, performance profile.
0.1.0 was recorded on 2026-10-07 (Electron 44.7.0, Mermaid 12.1.0); the 0.2.0 candidate on
2026-10-11 (Electron 44.7.0, Mermaid 12.1.0, headless); 0.2.0 on 2026-10-14 (Electron 44.7.2,
Mermaid 12.1.0, headless), with a new 50 KB reference document of the same size and structure;
0.3.0 on 2026-10-20 (Electron 44.9.2, Mermaid 12.2.0, headless, load average 0.1 before the run).
The memory baseline (1377 MB) was set by the owner on 2026-10-06, on Electron 44.5.1, after the
Electron and Mermaid updates (1257 → 1377 MB).

| Metric | Budget | 0.1.0 | 0.2.0 candidate | 0.2.0 | 0.3.0 |
|---|---|---|---|---|---|
| Cold start → window painted | 650 ms (2026-10-21; 850 ms until then; PRD target 500 ms) | 473 ms (p95 738) | 750 ms (p95 901) | 813 ms (p95 916) | 811 ms (p95 841) |
| Cold start → 50 KB document painted | 1250 ms (2026-10-21; 1300 ms until then; PRD target 500 ms) | 1198 ms (p95 1514) | 1255 ms (p95 1344) | 1263 ms (p95 1356) | 1264 ms (p95 1306) |
| Switch to a warm tab | 17 ms (one frame) | 16.1 ms (p95 17.3) | 15.2 ms (p95 25.3) | 15.5 ms (p95 17.4) | 16.3 ms (p95 17.7) |
| Wake a hibernated tab | 150 ms | 54 ms (p95 92) | 37 ms (p95 106) | 75 ms (p95 89) | 54 ms (p95 84) |
| Reading past 40 diagrams (a screen, then a pause) | reported | p95 16.7 ms; 0 of 432 frames over 34 ms | p95 16.8 ms; 0 of 432 frames over 34 ms | p95 16.8 ms; 0 of 432 frames over 34 ms | p95 16.8 ms; 0 of 432 frames over 34 ms |
| Memory, 3 profiles / 20 tabs / ≤ 3 warm per window | baseline, + 10 % fails | 1384 MB (baseline 1377 MB, `tests/perf/memory-baseline.json`) | 1386 MB | 1426 MB | 1435 MB (+4.2 %) |
| Typing in split, 5,000-word article: last keystroke → preview painted (v0.2) | 300 ms (owner, 2026-10-09) | — | 255 ms (p95 286) | 275 ms (p95 319) | 265 ms (p95 300) |
| Open a 10 MB / 200,000-node JSON as a tree: launch → first row painted (v0.3) | 3000 ms (starting value) | — | — | — | 1462 ms |
| Open a 99 MB CSV as a table: launch → first row painted (v0.3) | 5000 ms (ADR-020) | — | — | — | 2722 ms |
| Scrolling that tree or that table (v0.3) | median ≤ 34 ms per frame | — | — | — | 16.7 ms (p95 16.7) both |
| Memory, a 99 MB CSV table and a 10 MB JSON tree open in one window (v0.3) | baseline, + 10 % fails | — | — | — | 1026 MB |
| Paging through a 100 MB log (v0.4) | 17 ms per frame (2026-10-26) | — | — | — | — |
| A line appended to a followed 100 MB log, painted (v0.4) | 2000 ms (2026-10-26) | — | — | — | — |

The v0.3 rows were first measured on 2026-10-16 during development (headless, Electron 44.8.0, the
machine under a load average of 2–3, so not release figures): the JSON tree opened in 1550–1986 ms and
the CSV table in 2957–3308 ms, both scrolling at 16.7 ms per frame (p95 16.8); the large-data memory
was 1013–1215 MB: runs land near one end or the other (when garbage is collected), so the higher is
its baseline (`largeDataMemoryMB` in `tests/perf/memory-baseline.json`).
Building the commit before the tree and table and the one after, and timing their cold starts in turn
under the same load, gave the same figures: the views' code adds nothing measurable to a cold start.

Cold start during v0.4 (2026-10-21, before the 0.4.0 column exists): the window waited ~310 ms for
the page's own files, because Chromium's D-Bus theme settings arrived while the window existed and
re-theming it held main's thread; then ~100 ms for `app.info`. The first window now opens after the
theme settings, and the page paints from the start info its window was created with. Strict
headless medians: window 853 → 571 and 577 ms, 50 KB document 1249 → 1119 and 1106 ms (two runs
each). On the owner's Wayland desktop (direct launches, two interleaved pairs of 10 against the
build before): window 941 and 940 → 668 and 656 ms. The budgets became 650 ms and 1250 ms.

The log rows were first measured on 2026-10-26 during development (headless, not release figures),
before log lines had colour: 16.7 ms per frame paging (p95 16.8–33.3), 1609–1762 ms for an appended
line, nearly all of it reading the whole file again. With colour, under a load average of 2.5–4.5
(another project's tests running): 16.7 ms and 1502–1714 ms in three runs, 33.3 ms and 2278 ms in
one. Colouring a line costs about 4 µs, about 0.3 ms for a screen of 80 lines.

The first strict run of the 0.2.0 candidate measured 913 ms for a blank window: its first
launches after a fresh build, with the operating system's file cache cold. A run straight after
gave the 750 ms above; cold starts in the regular test runs since v0.2 began measure 740–760 ms.

## Keyboard map (UX §5)

- **Conformance**: `tests/e2e/palette.spec.ts` checks that the palette lists every v0.1 row of the
  UX §5 map with its keys, on Linux and macOS (go to tab 1–8 as eight entries; the find bar's
  Enter/Shift+Enter in `find.spec`), and the v0.2 rows: edit mode, save, split view and find &
  replace. The editing keys (Ctrl+D, Ctrl+Shift+L, Shift+Alt+↑/↓, Ctrl+click, Alt+drag) are
  CodeMirror's and outside the palette; `replace.spec` presses each in the real window.
- **GNOME conflicts**: `src/shared/keymap.test.ts`, and `source-view.test.ts` for the keys edit
  mode adds, keep the Linux map free of Super, of Ctrl+Alt, and of GNOME's own Alt keys (Alt+Tab,
  Alt+Esc, Alt+Space, Alt+F1–F10, Alt+Print). Checked against `gsettings` on Ubuntu 26.04 (GNOME's
  `wm`, `shell`, `mutter` and `media-keys` bindings) on 2026-10-05: galeo's Alt keys are Alt+Z
  and Alt+←/→, which GNOME doesn't bind. Edit mode, checked against the `wm` and `media-keys`
  bindings on 2026-10-10: GNOME switches workspaces with Ctrl+Alt+↑/↓, so adding a cursor
  above/below is Shift+Alt+↑/↓; its window-drag modifier is Super, leaving Alt+drag to the editor.
  Reader width (v0.3), checked on 2026-10-18: Alt++ / Alt+=, Alt+- and Alt+0 are bound nowhere in
  those schemas (the magnifier's zoom keys are Super+Alt+= and Super+Alt+-), nor in CodeMirror's edit
  keys; the palette spec lists them with the keyboard map.
  Search tabs (v0.4), checked on 2026-10-21: Ctrl+Shift+A is bound nowhere in GNOME's schemas nor
  by IBus (its emoji keys are Super+. and Super+;); only the Ptyxis terminal uses it, inside its
  own window.
  Find in all tabs (v0.4), checked on 2026-10-26: Ctrl+Shift+F is bound nowhere in those GNOME
  schemas nor by IBus (emoji Super+. and Super+;, Unicode Ctrl+Shift+U).
  Tab overview (v0.4), checked on 2026-10-21: Ctrl+Shift+E is bound nowhere in those GNOME schemas
  nor by IBus (emoji Super+. and Super+;, Unicode Ctrl+Shift+U); the Ghostty terminal uses it for a
  split, inside its own window, which shows no desktop-wide binding takes it first.
  Tabs on the left (v0.4), checked on 2026-10-22: Ctrl+Shift+B is bound nowhere in those GNOME
  schemas (wm, media keys, shell, mutter) nor by IBus (emoji Super+. and Super+;, Unicode
  Ctrl+Shift+U, input switch Super+Space).

## Desktop and Wayland (manual)

On the reference platform with the installed `.deb`; Playwright runs under X11 and can't show
these.

| Check | Result |
|---|---|
| Double-click a `.md` in Files; *Open With → galeo*; set galeo as the default for `.md`, `.txt`, `.log`; a `.markdown` opens too | Pass (2026-10-06; again after removing and reinstalling the `.deb`, 2026-10-07) |
| `galeo file.md` and `gal file.md` from a terminal (the `.deb`'s `/usr/bin/galeo` and `/usr/bin/gal`); the AppImage's "Install command-line launcher" then `galeo` | Pass (2026-10-06; `.deb` again on 2026-10-07; as `galeo`/`gal`, `.deb` 0.2.0, 2026-10-15) |
| Uninstall the AppImage's launcher (v0.4): after *Install command-line launcher*, *Uninstall command-line launcher* names what it removed; `galeo` is no longer found in a new terminal, galeo is gone from the applications grid, and an `.mdx` file is no longer *MDX document* in Files. A hand-written `~/.local/bin/galeo` stays, and the message names it | Not run (2026-10-28): for the 0.4.0 run |
| Two profiles' windows open: `galeo --profile acme a.md`, a double-click in Files, a drop from Files and a plain `galeo` each land in the right window (a plain one in the window focused last) | Pass (2026-10-07; 0.2.0 `.deb`, 2026-10-15) |
| Drop files from Files onto the document area: they open after the shown tab, the first one shown | Pass (2026-10-05) |
| Drop onto a tab (the caret between tabs): they open at the caret | Pass (2026-10-05) |
| Drop onto the empty tab-bar space (the window-drag region) | Pass (2026-10-05) |
| Drop a folder: quick open opens on it | Pass (2026-10-05) |
| `galeo file.md` while galeo is on another workspace: GNOME's "galeo is ready" notice, no workspace switch | Pass (2026-10-05, Ubuntu 26.04; 0.2.0 `.deb`, 2026-10-15) |
| Live reload from a real editor or agent: in place, no jump, `↻` for about a second | Pass (2026-10-05) |
| Quick open in a real repository: dot folders listed, `node_modules` not; Ctrl+Enter opens a new window | Pass (2026-10-05) |
| Palette: F11 toggles full screen; "Toggle edit mode" only says "Press Ctrl+E" | Pass (2026-10-05) |
| Mermaid in real documents (edge labels, line breaks, subgraphs) draws, follows light/dark, and a broken one shows its error | Pass (2026-10-05, after the sanitizer fix) |
| Reader width (v0.3): Alt+= / Alt+- / Alt+0 on a long Markdown file and a `.txt`, Full width from the palette; the width comes back after a restart; Settings' measure presets move the tabs left at the setting | Pass (2026-10-20, `.deb` 0.3.0) |
| Font pickers (v0.3): the installed families are listed (monospace ones only for code), each in its face; a chosen one is the documents' font; a typed name not installed falls back | Pass (2026-10-20, `.deb` 0.3.0) |
| About galeo (v0.3) from the profile menu and from Settings shows the version | Pass (2026-10-20, `.deb` 0.3.0) |
| `.mdx` in Files (v0.3): `xdg-mime query filetype` says `text/mdx`; *Open With* offers galeo; set as the default, a double-click opens it | Pass (2026-10-20, `.deb` 0.3.0) |
| Data and code from Files (v0.3): a `.json`, `.csv`, `.yaml` and `.ts` each offer galeo; a double-click opens JSON as a tree, CSV as a table, YAML highlighted with its key outline, TypeScript highlighted | Pass (2026-10-20, `.deb` 0.3.0) |
| A CSV with 3,000 columns (v0.3): opens at once; the wheel and touchpad scroll sideways and draw the columns; End on a cell goes to the last column, Home back; nothing freezes | Pass (2026-10-20, `.deb` 0.3.0) |
| Moving tabs (v0.3, real drags on Wayland): a tab dragged onto another window's tab bar, onto its empty part, and into a window with no tabs moves there on the first try, also back into the window it was torn off from, shown, with no "galeo is ready" notice; into another profile's window it stays there after a restart | Pass (2026-10-20; again on the 0.3.0 `.deb`) |
| Reordering tabs (v0.3): a tab dragged to another place in its own tab bar moves there | Pass (2026-10-20, `.deb` 0.3.0) |
| Tabs on the left, drags (v0.4, real drags on Wayland): a row dragged up or down the list moves there; files dropped between two rows open there; a row dragged to another profile's tab bar (tabs on top) moves there, and back into the panel; a row dropped outside every window opens a window of its own; a row dragged out over the title bar and back is not torn off; the title bar's name and empty space drag the window; the divider drags, and under 100 px collapses the panel | Not run (2026-10-22): for the 0.4.0 run |
| Tab overview drags (v0.4, real drags on Wayland): a card dragged before or after another moves its tab there, and the tab bar shows the new order; a card dragged over another galeo window offers nothing there (no "Open 1 file here") | Not run (2026-10-21): for the 0.4.0 run |
| Tear-off (v0.3): a tab dragged out to the desktop, or onto another application's window, from a window of two or more gets its own window, the old one stays; a window's only tab dragged out stays; Esc outside the window tears off too; a drag starts from anywhere on a tab, also after holding the press a moment | Pass (2026-10-20; again on the 0.3.0 `.deb`) |
| A tab with unsaved changes dragged to another window keeps its text, `●` and edit mode; saving there writes the file | Pass (2026-10-19) |
| Moving tabs under X11 (unverified in development: the spike ran on Wayland only) | Not run (2026-10-19): the owner's desktop has no X11 session |
| Installed `.deb` (Trusted Types enforced): a document with Mermaid diagrams and math draws in full, with no Trusted Types errors | Pass (2026-10-06) |
| Outline follows the scroll; Esc returns focus to the document | Pass (2026-10-05) |
| Zoom: Ctrl++ on an es-US layout; Ctrl+wheel over the document and the tab bar zooms the tab, and in the viewer zooms only the viewer | Pass (2026-10-07) |
| Tab strip overflowing: ‹ › and the wheel scroll it sideways | Pass (2026-10-07) |
| Status bar: rendered Markdown shows words and reading time, its source view adds the line count, a log shows its line count | Pass (2026-10-07) |
| Diagrams in real articles: sized to the column (a wide one scrolls sideways), ⤢ opens the viewer, one with its own colours sits on a light panel in dark mode; a pie's slices all show in dark mode | Pass (2026-10-07) |
| A document with math and diagrams draws both; a document's images open in the viewer | Pass (2026-10-07) |
| Links open on a click; Delete profile and Clear recent still work (they need real input, SR-12) | Pass (2026-10-07) |
