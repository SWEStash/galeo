# galeo — validation record

What was checked for a release, how, and the result. Automated checks run in CI and in
`npm run preflight`; the manual ones are done on the reference platform (Ubuntu 26.04 LTS, GNOME,
Wayland) before each release.

## Accessibility (WCAG 2.1 AA)

### Automated

- **axe** (`@axe-core/playwright`) on every surface, in the e2e suite: tab bar, document (prose,
  GFM, code, math, diagrams) and source and log views in light and dark, document states and
  banners in both schemes, find bar, quick open, palette, About, outline, Settings, status bar,
  profile menu and dialogs, empty window, settings notices, and the sandbox-unavailable window.
  The drop overlay is decorative (`aria-hidden`); quick open is the keyboard way to open files.
- **Contrast** (`tests/unit/design/colour-contrast.test.ts`): text tokens at 4.5:1 and focus ring
  and text-field borders at 3:1 on the page and on panels, in both schemes; the 8 accent presets
  at 3:1 on the tab bar; every code-highlighting colour at 4.5:1 on code blocks.

### Manual (keyboard only, then Orca)

Record the date, the build and the result of each row.

| Check | How | Result |
|---|---|---|
| Open, read and close documents without a mouse | `galeo` a file; Ctrl+P, type, Enter; Ctrl+Tab between tabs; Ctrl+W | |
| Every overlay traps focus and gives it back | Ctrl+P, Ctrl+Shift+P, Ctrl+F, Ctrl+Shift+O, About, Settings (Ctrl+,), profile menu (Ctrl+Shift+M): Tab stays inside, Esc returns to the document | |
| Focus is always visible | Tab through the tab bar, status bar, Settings and dialogs in light and dark | |
| Source and log views scroll by keyboard | Ctrl+U, then Tab into the text; arrows, PgUp/PgDn, Home/End; End follows a log | |
| Orca names the tab bar and tabs | Orca on; tabs are announced with their names and indicators (↻, ✕, ⚠ as words) | |
| Orca reads a document | Headings (H to jump), lists, task checkboxes (named by their item), tables, links, code | |
| Orca announces changes | Quick open's result count, "↻ Reloaded", find's "n of m", the status messages | |
| Zoom 200 % | Ctrl+= to 200 % on a long document: no clipped text in the chrome | |

## Performance

`GALEO_PERF=1 npm run build`, then `GALEO_PERF_ENFORCE=1 npm run headless -- npm run test:perf`, on its
own (a long test run beforehand heats the laptop and slows it). Medians of 10 runs; a cold start is
a typical launch: galeo not running, its caches from earlier launches kept.

Reference machine: Intel i7-8565U laptop, 45 GB, Ubuntu 26.04, on AC, performance profile;
Electron 44.4.5. Recorded 2026-10-05.

| Metric | Budget | Measured |
|---|---|---|
| Cold start → window painted | 850 ms (v0.1; PRD target 500 ms, v0.1.x) | 770 ms (p95 794) |
| Cold start → 50 KB document painted | 1300 ms (v0.1; PRD target 500 ms, v0.1.x) | 1181–1185 ms |
| Switch to a warm tab | 17 ms (one frame) | 16.3 ms (p95 17.0) |
| Wake a hibernated tab | 150 ms | 66 ms (p95 94) |
| Reading past 40 diagrams (a screen, then a pause) | reported | p95 33 ms; 15–20 of 472 frames over 34 ms |
| Memory, 3 profiles / 20 tabs / ≤ 3 warm per window | baseline, + 10 % fails | 1257 MB (baseline, `tests/perf/memory-baseline.json`) |
