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
- **Contrast** (`tests/unit/design/colour-contrast.test.ts`): text tokens at 4.5:1 and focus ring
  and text-field borders at 3:1 on the page and on panels, in both schemes; the 8 accent presets
  at 3:1 on the tab bar; every code-highlighting colour at 4.5:1 on code blocks.

### Manual (keyboard only, then Orca)

Record the date, the build and the result of each row.

| Check | How | Result |
|---|---|---|
| Open, read and close documents without a mouse | `galeo` a file; Ctrl+P, type, Enter; Ctrl+Tab between tabs; Ctrl+W | Pass (2026-10-06, `.deb`) |
| Every overlay traps focus and gives it back | Ctrl+P, Ctrl+Shift+P, Ctrl+F, Ctrl+Shift+O, About, Settings (Ctrl+,), profile menu (Ctrl+Shift+M): Tab stays inside, Esc returns to the document | Pass (2026-10-06, `.deb`) |
| Focus is always visible | Tab through the tab bar, status bar, Settings and dialogs in light and dark | Pass (2026-10-06, `.deb`) |
| Source and log views scroll by keyboard | Ctrl+U, then Tab into the text; arrows, PgUp/PgDn, Home/End; End follows a log | Pass (2026-10-06, `.deb`) |
| Orca: tabs | Turn Orca on (Super+Alt+S). Open three files, press Ctrl+Tab: Orca says each tab's name and "tab, n of 3"; on a file being rewritten it adds "reloaded from disk", on a deleted one "file missing" | Pass (2026-10-06, `.deb`) |
| Orca: reading a document | Click into a document and use Orca's browse keys: H jumps heading to heading and reads them, L list by list, T to a table (it reads the header cells with each cell), K link by link; a task item reads as "checkbox, checked" plus its text | Pass (2026-10-06, `.deb`) |
| Orca: overlays | Ctrl+P: Orca says "Quick open", then the result count ("3 results"); arrows read each result. Ctrl+Shift+P reads each command with its keys. Ctrl+F, type: it says "n of m". Esc: focus is back on the document | Pass (2026-10-06, `.deb`) |
| Orca: status messages | Save a shown file from an editor: it says "Reloaded". In the palette, choose "Toggle edit mode": it says "Press Ctrl+E" | Pass (2026-10-06, `.deb`) |
| Zoom 200 % | Ctrl++ to 200 % on a long document: no clipped text in the chrome | Pass (2026-10-06, `.deb`) |
| Edit and save without a mouse (v0.2) | Ctrl+E, type, Ctrl+S; Ctrl+E again reads. Ctrl+W, Ctrl+Shift+W, Ctrl+Q and deleting the profile with unsaved changes each ask; Tab moves between Cancel, Don't save and Save; Esc cancels and the caret is back in the editor | |
| File changed on disk, by keyboard (v0.2) | Change the file in another editor while editing: Shift+Tab from the editor reaches Load theirs, Keep mine and Show diff; each choice puts the caret back in the editor. Show diff: Esc returns to its button. Delete the file: Save again writes it back | |
| Split and editor basics by keyboard (v0.2) | Ctrl+\; Tab to the divider, ←/→ move it, Home resets it. Ctrl+H, type, Enter replaces one, Replace all, Ctrl+Z undoes it all. Ctrl+D twice, Shift+Alt+↓, then type at every cursor; Esc leaves one | |
| Orca: editing (v0.2) | Ctrl+E then Ctrl+Tab away and back: the tab reads "…, edit mode", and once typed in "…, unsaved changes". Ctrl+S: "Saved". A refused save reads its reason. The changed-on-disk bar reads "File changed on disk"; the unsaved question reads "Save changes to <name>?" and each button | |
| Orca: diff, split and replace (v0.2) | Show diff reads "Changes: mine \| theirs", then "Mine (unsaved)" and "Theirs (on disk)" as read-only text. The divider reads "Resize source and preview" with its value as it moves. Replace all reads "Replaced N" once (not twice with the editor's own message). Several cursors: typing reads as usual | |

## Performance

`GALEO_PERF=1 npm run build`, then `GALEO_PERF_ENFORCE=1 npm run headless -- npm run test:perf`, on its
own (a long test run beforehand heats the laptop and slows it). Medians of 10 runs; a cold start is
a typical launch: galeo not running, its caches from earlier launches kept.

Reference machine: Intel i7-8565U laptop, 45 GB, Ubuntu 26.04, on AC, performance profile;
Electron 44.7.0, Mermaid 12.1.0. Recorded 2026-10-07 for 0.1.0. The memory baseline (1377 MB) was
set by the owner on 2026-10-06, on Electron 44.5.1, after the Electron and Mermaid updates (1257 → 1377 MB).

| Metric | Budget | Measured |
|---|---|---|
| Cold start → window painted | 850 ms (v0.1; PRD target 500 ms, v0.1.x) | 473 ms (p95 738) |
| Cold start → 50 KB document painted | 1300 ms (v0.1; PRD target 500 ms, v0.1.x) | 1198 ms (p95 1514) |
| Switch to a warm tab | 17 ms (one frame) | 16.1 ms (p95 17.3) |
| Wake a hibernated tab | 150 ms | 54 ms (p95 92) |
| Reading past 40 diagrams (a screen, then a pause) | reported | p95 16.7 ms; 0 of 432 frames over 34 ms |
| Memory, 3 profiles / 20 tabs / ≤ 3 warm per window | baseline, + 10 % fails | 1384 MB (baseline 1377 MB, `tests/perf/memory-baseline.json`) |
| Typing in split, 5,000-word article: last keystroke → preview painted (v0.2) | 300 ms (owner, 2026-10-09) | 260 ms (p95 292), headless, 2026-10-09; strict run with the 0.2.0 release check |

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

## Desktop and Wayland (manual)

On the reference platform with the installed `.deb`; Playwright runs under X11 and can't show
these.

| Check | Result |
|---|---|
| Double-click a `.md` in Files; *Open With → galeo*; set galeo as the default for `.md`, `.txt`, `.log`; a `.markdown` opens too | Pass (2026-10-06; again after removing and reinstalling the `.deb`, 2026-10-07) |
| `galeo file.md` from a terminal (the `.deb`'s `/usr/bin/gal`); the AppImage's "Install command-line launcher" then `galeo` | Pass (2026-10-06; `.deb` again on 2026-10-07) |
| Two profiles' windows open: `galeo --profile acme a.md`, a double-click in Files, a drop from Files and a plain `galeo` each land in the right window (a plain one in the window focused last) | Pass (2026-10-07) |
| Drop files from Files onto the document area: they open after the shown tab, the first one shown | Pass (2026-10-05) |
| Drop onto a tab (the caret between tabs): they open at the caret | Pass (2026-10-05) |
| Drop onto the empty tab-bar space (the window-drag region) | Pass (2026-10-05) |
| Drop a folder: quick open opens on it | Pass (2026-10-05) |
| `galeo file.md` while galeo is on another workspace: GNOME's "galeo is ready" notice, no workspace switch | Pass (2026-10-05, Ubuntu 26.04) |
| Live reload from a real editor or agent: in place, no jump, `↻` for about a second | Pass (2026-10-05) |
| Quick open in a real repository: dot folders listed, `node_modules` not; Ctrl+Enter opens a new window | Pass (2026-10-05) |
| Palette: F11 toggles full screen; "Toggle edit mode" only says "Press Ctrl+E" | Pass (2026-10-05) |
| Mermaid in real documents (edge labels, line breaks, subgraphs) draws, follows light/dark, and a broken one shows its error | Pass (2026-10-05, after the sanitizer fix) |
| Installed `.deb` (Trusted Types enforced): a document with Mermaid diagrams and math draws in full, with no Trusted Types errors | Pass (2026-10-06) |
| Outline follows the scroll; Esc returns focus to the document | Pass (2026-10-05) |
| Zoom: Ctrl++ on an es-US layout; Ctrl+wheel over the document and the tab bar zooms the tab, and in the viewer zooms only the viewer | Pass (2026-10-07) |
| Tab strip overflowing: ‹ › and the wheel scroll it sideways | Pass (2026-10-07) |
| Status bar: rendered Markdown shows words and reading time, its source view adds the line count, a log shows its line count | Pass (2026-10-07) |
| Diagrams in real articles: sized to the column (a wide one scrolls sideways), ⤢ opens the viewer, one with its own colours sits on a light panel in dark mode; a pie's slices all show in dark mode | Pass (2026-10-07) |
| A document with math and diagrams draws both; a document's images open in the viewer | Pass (2026-10-07) |
| Links open on a click; Delete profile and Clear recent still work (they need real input, SR-12) | Pass (2026-10-07) |
