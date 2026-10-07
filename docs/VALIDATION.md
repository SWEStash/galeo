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

## Performance

`GALEO_PERF=1 npm run build`, then `GALEO_PERF_ENFORCE=1 npm run headless -- npm run test:perf`, on its
own (a long test run beforehand heats the laptop and slows it). Medians of 10 runs; a cold start is
a typical launch: galeo not running, its caches from earlier launches kept.

Reference machine: Intel i7-8565U laptop, 45 GB, Ubuntu 26.04, on AC, performance profile;
Electron 44.5.1, Mermaid 12.1.0. Recorded 2026-10-06 (memory re-baselined by the owner after the Electron and
Mermaid updates: 1257 → 1377 MB; the earlier figures were on Electron 44.4.5 and Mermaid 11.17.2).

| Metric | Budget | Measured |
|---|---|---|
| Cold start → window painted | 850 ms (v0.1; PRD target 500 ms, v0.1.x) | 727 ms (p95 1049) |
| Cold start → 50 KB document painted | 1300 ms (v0.1; PRD target 500 ms, v0.1.x) | 1246 ms (p95 1499) |
| Switch to a warm tab | 17 ms (one frame) | 16.4 ms (p95 23.5) |
| Wake a hibernated tab | 150 ms | 84 ms (p95 119) |
| Reading past 40 diagrams (a screen, then a pause) | reported | p95 16.8 ms; 0 of 432 frames over 34 ms |
| Memory, 3 profiles / 20 tabs / ≤ 3 warm per window | baseline, + 10 % fails | 1377 MB (baseline, `tests/perf/memory-baseline.json`) |

## Keyboard map (UX §5)

- **Conformance**: `tests/e2e/palette.spec.ts` checks that the palette lists every v0.1 row of the
  UX §5 map with its keys, on Linux and macOS (go to tab 1–8 as eight entries; the find bar's
  Enter/Shift+Enter in `find.spec`). Save, split view and find & replace are v0.2.
- **GNOME conflicts**: `src/shared/keymap.test.ts` keeps the Linux map free of Super, of Ctrl+Alt,
  and of GNOME's own Alt keys (Alt+Tab, Alt+Esc, Alt+Space, Alt+F1–F10, Alt+Print). Checked against
  `gsettings` on Ubuntu 26.04 (GNOME's `wm`, `shell`, `mutter` and `media-keys` bindings) on
  2026-10-05: galeo's Alt keys are Alt+Z and Alt+←/→, which GNOME doesn't bind.

## Desktop and Wayland (manual)

On the reference platform with the installed `.deb`; Playwright runs under X11 and can't show
these.

| Check | Result |
|---|---|
| Double-click a `.md` in Files; *Open With → galeo*; set galeo as the default for `.md`, `.txt`, `.log` | Pass (2026-10-06) |
| `galeo file.md` from a terminal (the `.deb`'s `/usr/bin/gal`); the AppImage's "Install command-line launcher" then `galeo` | Pass (2026-10-06) |
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
