# Visual refresh (v0.7)

- Date: 2026-11-05
- Status: accepted by the owner (2026-11-05): direction A with B's Settings cards (§3); the tools at
  the bar's far right (§6). Built in v0.7, with the changes from the owner's look checks
  (2026-11-06) written into §4
- Scope: the interface around the document: the tab bar or title bar, the side panel, the status bar,
  menus, overlays (palette, quick open, tab search, tab overview, find in all tabs, find bar, outline),
  dialogs and modals, banners, the empty window and Settings. Documents keep their look
  ([document-styling.md](document-styling.md) is unchanged by this pass).
- Frame: [ux.md](ux.md) §1: reading first, chrome last; quiet, honest states. Nothing here adds a
  surface; it changes how the existing ones look and adds the controls the
  [mouse paths review](mouse-paths.md) accepted.

## 1. What's inconsistent today

Taken from screenshots of every surface in both themes and from `src/renderer/styles/app.css`
(1,636 lines) as of 0.6.0.

| Area | Today | Effect |
|---|---|---|
| Text sizes | 11 sizes in the chrome: 9, 10, 11, 12, 13, 14, 15, 16, 18 and 22 px, plus em values | Neighbouring surfaces differ by 1 px for no reason (the tab bar is 13 px, the status bar 12, menus 14) |
| Spacing | Paddings and gaps of 2, 3, 4, 5, 6, 8, 10, 12, 16, 24 px | No rhythm; 3, 5 and 10 px appear only a few times |
| Corners | `--galeo-radius` (6 px, documented as the *code block* corner) used 13 times by the chrome, plus 3, 4 and 10 px | The chrome depends on a document token a reader may change in `custom.css`… which can't reach the chrome anyway, so the link is accidental |
| Shadows | Four different overlay shadows (2/8, 4/12, 4/16, 8/24 px) | Menus, popovers and dialogs sit at random heights |
| Backdrops | Every overlay dims the window with the same 35 % black, in both themes | Heavy in light, barely visible in dark |
| Chrome colours | The bar uses the document's `--galeo-color-code-bg`; hover and selection mix `--galeo-color-focus` at 15 % | Fine for contrast, but the chrome has no colours of its own to tune |
| Icons | Text symbols: `+` `▦` `◧` `‹` `›` `✕` `⤢` `⇣` `•` `↻` `▾` | Uneven sizes and weights across fonts and platforms; nothing to draw new controls (Commands, Search tabs, pin, copy, save) with |
| Tabs | Fixed width, a divider between each, `✕` on every tab, an accent line under the shown one | Busy with many tabs; the shown tab stands out by a 2 px line only |
| Status bar | Plain text segments with equal weight | The path and the state (Read-only / Editing) read the same as the word count |
| Settings | "Where this value comes from" labels float at the column's right edge, off the control's line | Hard to tie a label to its setting |
| Motion | Two animations (reload pulse, skeleton), no hover or open transitions; reduced motion handled for both | Fine to keep sparse; menus and overlays pop in |

Kept as they are: the layout (tabs on top or on the left, ADR-023), every keyboard path, the
focus colour, the profile accent and its 8 presets, the status bar's height of 24 px, the side
panel's widths (collapsed 32 px), the title bar's drag area, the document area.

## 2. The scale

One set of internal tokens for the chrome, in `tokens.css`. Whether a document's `custom.css` can
use them is ADR-032's call; this section only fixes the values.

### Spacing (4 px steps, with the two half steps the chrome needs)

| Token | px | Typical use |
|---|---|---|
| `--galeo-space-2xs` | 2 | Between an icon and its badge |
| `--galeo-space-xs` | 4 | Inside small controls, between keys |
| `--galeo-space-sm` | 6 | Icon to label |
| `--galeo-space-md` | 8 | Control padding, list row padding |
| `--galeo-space-lg` | 12 | Overlay padding, between groups |
| `--galeo-space-xl` | 16 | Dialog padding, Settings rows |
| `--galeo-space-2xl` | 24 | Between Settings sections |
| `--galeo-space-3xl` | 32 | Empty-window and Settings page margins |

### Text (Inter, the UI font)

| Token | px / line | Use |
|---|---|---|
| `--galeo-text-xs` | 11 / 16 | Badges (MD, JSON), key caps, counts |
| `--galeo-text-sm` | 12 / 16 | Status bar, secondary lines (folders), hints |
| `--galeo-text-md` | 13 / 20 | Tabs, menus, lists, buttons: the chrome's body |
| `--galeo-text-lg` | 15 / 22 | Overlay inputs (palette, quick open), Settings labels |
| `--galeo-text-xl` | 18 / 24 | Dialog titles, Settings section headings |
| `--galeo-text-2xl` | 22 / 28 | The Settings and empty-window titles |

Weights: 400 and 600 only (Inter is bundled with both).

### Corners, borders, elevation

| Token | Value | Use |
|---|---|---|
| `--galeo-radius-sm` | 4 px | Key caps, badges, small buttons |
| `--galeo-radius-md` | 6 px | Buttons, inputs, list rows, the tabs' top corners |
| `--galeo-radius-lg` | 10 px | Menus, overlays, dialogs, cards |
| `--galeo-radius-full` | 999 px | The profile chip, dots |
| `--galeo-shadow-1` | light `0 2px 8px rgb(0 0 0 / 12%)`, dark `0 2px 8px rgb(0 0 0 / 40%)` | Menus and popovers |
| `--galeo-shadow-2` | light `0 8px 28px rgb(0 0 0 / 18%)`, dark `0 8px 28px rgb(0 0 0 / 55%)` | Overlays and dialogs |
| `--galeo-scrim` | light `rgb(0 0 0 / 25%)`, dark `rgb(0 0 0 / 50%)` | Behind every overlay that takes the keyboard (palette, quick open, tab search, overview, find in all tabs, dialogs) |

Overlays and menus also keep a 1 px border, so they stand out where a shadow is hard to see (dark
theme, high-contrast setups).

### Chrome colours

The chrome gets its own colours, derived from the document's, so a theme keeps one source:

| Token | Light | Dark | Use |
|---|---|---|---|
| `--galeo-chrome-bar` | `#f6f8fa` | `#010409` | Tab bar or title bar, side panel, status bar |
| `--galeo-chrome-surface` | `#ffffff` | `#0d1117` | Menus, overlays, dialogs, the shown tab |
| `--galeo-chrome-hover` | fg 6 % on the bar (`#e9ebed` / `#0f1217`) | | A control or row under the pointer |
| `--galeo-chrome-press` | fg 10 % (`#e1e3e5` / `#181b20`) | | Pressed; an open menu's button |
| `--galeo-chrome-selected` | focus 15 % on the surface (`#dae9f9` / `#152539`) | | The highlighted row in a list |

Text keeps `--galeo-color-fg` and `--galeo-color-muted`; edges keep `--galeo-color-border` and, for
controls, `--galeo-color-control-border`. Dark's bar moves from `#161b22` to `#010409`, darker than
the page, so the document reads as the lit surface.

Contrast, computed with `tests/helpers/contrast.ts` (minimum: 4.5 text, 3 controls and focus):

| Pair | Light | Dark |
|---|---|---|
| fg on bar | 14.84 | 17.38 |
| muted on bar | 5.74 | 7.05 |
| muted on hover | 5.12 | 6.44 |
| muted on press | 4.75 | 5.93 |
| fg on selected | 12.79 | 13.11 |
| muted on selected | 4.95 | 5.32 |
| focus on bar | 4.88 | 6.63 |
| focus on surface | 5.19 | 6.11 |
| control border on surface | 3.45 | 4.12 |
| control border on bar | 3.24 | 4.47 |
| Direction B's bar tinted with the accent (6 %), worst of the 8 presets: muted | 5.30 | 6.74 |
| the same, accent itself (worst preset) | 3.01 | 4.01 |

### Motion

| Token | Value | Use |
|---|---|---|
| `--galeo-motion-fast` | 100 ms | Hover and press colours |
| `--galeo-motion-base` | 150 ms | Menus and overlays opening (fade + 4 px rise), the side panel collapsing |
| `--galeo-ease` | `cubic-bezier(0.2, 0, 0, 1)` | Everything |

Nothing animates on close, on tab switches or in the document. Under `prefers-reduced-motion:
reduce` every duration is 0 (one rule in `tokens.css`), as the reload pulse and skeleton already are.

### Focus

A 1 px ring in `--galeo-color-focus`, the same on every control and in documents. Outside a control
it has a faint halo (the colour at 18 %); inside one (tabs, list rows, the document area, overview cards)
it sits on the edge, without a halo. The colour is the softest blue that still stands out 3:1 on every
background it meets (light `#218bff`, dark `#2d65b9`; owner, 2026-11-06).

## 3. Two directions

Both use §2's scale, the same layout and the same icons; they differ in how much the chrome shows
itself. Mockups (HTML, not shipped) were drawn for each, with tabs on top and on the left, the
palette and Settings, light and dark.

| | A: refined | B: modern |
|---|---|---|
| Idea | Today's flat look, made consistent | The same, with more depth and the profile's colour in the frame |
| Bar | `--galeo-chrome-bar` | The bar tinted with the profile accent (6 %), no bottom edge; the document starts with a hairline |
| Tabs | Flat; the shown tab takes the document's colour, joins it (no line between them) and has a 2 px accent line on top | Rounded (`radius-md`) with 4 px gaps; the shown tab is lifted (`surface`, `shadow-1`), its name in 600, an accent bar before it |
| Side panel rows | The shown row: `surface` with a 3 px accent edge | The shown row: lifted like the shown tab |
| Status bar | Segments spaced 12 px; Read-only / Editing as an outlined badge | Segments split by small dots; the badge filled (fg 8 %) |
| Overlays | `radius-lg`, `shadow-2`, scrim | Same |
| Settings | Sections divided by rules | Sections as cards (`radius-lg`, border) |
| Height | Bar 40 px (36 today), status bar 24 | Bar 44, status bar 26 |

A third, **C: quiet** (the bar, panel and status bar in the page's colour, a short accent underline
under the shown tab), was shown in an interactive prototype beside A and B.

**Owner's choice (2026-11-05): A, with B's Settings cards.** The rest of this document describes that
direction; where it said "A:" or "B:" before, A holds, except Settings (cards).

## 4. Surfaces

The same for both directions unless a row says otherwise. Every state keeps today's text or
accessible name; colour is never the only signal.

### Tab bar (tabs on top) and title bar (tabs on the left)

- **Purpose:** switch documents; reach the window's tools. Keeps a drag area at all times (ADR-019).
- **Order:** profile chip · tabs · `+` New tab (quick open) · drag area · `▦` Tab overview · `⌕` Search
  tabs · `⋯` Commands · window controls. With tabs on the left: `◧` Panel · chip · `+`
  · the shown tab's name and folder (centred, muted, on the drag area) · `▦` `⌕` `⋯` · window
  controls. `+` stays where a new tab appears; the tools keep one place however many tabs are open
  (on macOS, where the window buttons are at the start, the tools end the bar).
- **Tab states:** default (muted text); hover (`chrome-hover`, fg text, `✕` shown); shown (joins the
  document, 2 px accent line on top, `✕` shown); focus (the ring inside, §2 Focus); dragged (today's ghost and drop line, recoloured
  `focus`); hibernated (muted, as today); updated (a 6 px `link` dot before `✕`, name gains "changed on
  disk"); edited (`●` in place of `✕` until hover, as today); missing file (muted italic, "file missing"
  as today); pinned (§5 pin icon before the name, no `✕`, name gains
  "pinned").
- **Tab width:** fits its name between 96 and 200 px (today: fixed); the strip scrolls as today, and
  while it does `+` sits after the right scroll button.
- **Separators:** a 1 px line, half the tab's height, at the right of each tab; hidden beside the
  shown, hovered and focused tabs, as browsers do (owner, 2026-11-06).
- **Icon buttons:** 28 × 28, `radius-md`, muted icon; hover `chrome-hover` + fg; pressed or menu
  open `chrome-press`; focus ring. Each has a tooltip with its shortcut, as `▦` has today.

### Profile chip and profile menu

- **Chip:** accent dot + name, 26 px, `radius-md`, border, `surface`.
- **Menu:** `surface`, `radius-lg`, `shadow-1`, border, 6 px inset; rows 28 px, `radius-md`, hover
  `chrome-hover`, focus ring; group label in `text-xs` 600 muted. Entries, in order: profiles (open
  one) · New window · Settings · New / Edit / Delete profile… · Restore previous session · About galeo.
  Disabled rows muted (≥ 4.5:1 is not required for disabled controls, but they keep it).

### Side panel (tabs on the left)

- Rows: name (`text-md`, 500) over folder (`text-xs`, muted), 6/8 px padding, `radius-md`. Rows touch;
  a 1 px line under each starts under the text and fades out to the right, hidden beside the shown,
  hovered and focused rows and after the last (owner, 2026-11-06).
  States as tabs. A **Pinned** group heads the list when any tab is pinned (`text-xs`, 600, muted,
  upper case), then the rest.
- Collapsed: 32 px wide, markers as today, drawn with the scale; the shown marker filled.
- The divider: unchanged (7 px handle, double-click resets).

### Status bar

- 24 px, `chrome-bar`, `text-sm`, muted; the path in fg. Segments: path (menu) · view
  (menu: Rendered / Source / Split, Wrap, Outline) · state badge · encoding (menu) · metrics · tasks ·
  changes · spacer · zoom (click resets) · width (click resets) · Follow (logs) · messages.
- A segment that does something is a button: hover `chrome-hover`, `radius-sm`, focus ring, a `▾`
  chevron when it opens a menu.

### Overlays (palette, quick open, tab search, find in all tabs, tab overview)

- One frame: `surface`, border, `radius-lg`, `shadow-2`, on `--galeo-scrim` (25 % light,
  50 % dark; today 35 % in both). 72 px from the top, 640 px wide (overview and find in all tabs as today).
- Input row: search icon + `text-lg` field, 12/16 px padding, a rule under it (no focus underline:
  the caret and the ring on the overlay show focus).
- Rows: 6/8 px padding inside a 6 px inset list, `radius-md`; highlighted row `chrome-selected`.
  Keys as caps: `text-xs`, border with a 2 px bottom, `radius-sm`, `chrome-bar` fill.
- Empty and error lines: muted `text-md`, centred, as today's text.
- Opening: fade + 4 px rise over `motion-base`; closing: instant.

### Find bar and outline

- Find bar: the overlay frame at the document's top right, `shadow-1`; its buttons are icon
  buttons. Outline: `chrome-bar` panel, rows as side panel rows; the task count right-aligned in
  `text-xs` muted.

### Dialogs and modals (profile dialogs, move dialog, show diff, About, close prompt)

- `surface`, `radius-lg`, `shadow-2`, scrim; title `text-xl` 600; 16 px padding; buttons 30 px,
  `radius-md`, primary filled in `focus` (light: white text, 5.19:1; dark: `#0d1117` text, 6.11:1).

### Banners (missing file, binary, large, render failed)

- A full-width strip at the document's top: `chrome-bar`, a 3 px left edge in the state's colour
  (`log-warn` / `log-error` / `link`), icon + text + buttons. Same text as today.

### Settings

- One column of 680 px, `text-2xl` title, sections with `text-xl` headings. Each setting a row:
  label (600) with where its value comes from under it (`text-sm`, muted), the control at the right
  on the same row (today the source floats away from its setting).
- Radio groups of up to 4 short choices become segmented controls (still `radiogroup`, arrow keys
  move): Theme, Change settings for, Tabs position, Measure's presets (**Custom** stays, opening its
  field). Longer lists stay radio lists. Accent swatches as today, with a 2 px fg ring on the chosen one.
- Sections as cards (`radius-lg`, border, `surface`), rows divided by rules.

### Empty window, viewer, drop area

- Empty window: centred, `text-2xl` title, recent files as overlay rows, buttons as dialogs'.
- Viewer: its toolbar as icon buttons on a `surface` pill with `shadow-1`.
- Drop area: a dashed 2 px `focus` edge, `radius-lg`, inset 8 px.

## 5. Icons

Own SVGs, 16 × 16 view box, 1.5 px strokes, round caps, `currentColor`, `aria-hidden` (the control
carries the name), in one module of the renderer.

| Icon | Used by |
|---|---|
| plus | New tab |
| grid | Tab overview |
| search | Search tabs; input rows of overlays; Find |
| more (three dots) | Commands |
| panel | Collapse or expand the side panel |
| chevron-left, chevron-right | Scroll the tab strip |
| chevron-down | Menus in the status bar; font pickers |
| close | Close tab; close overlays and banners |
| dot (filled) | Updated tab |
| pin | Pinned tabs; Pin in the tab menu's label is text only (native menu) |
| copy, check | Code block Copy button; "Copied" |
| download | Save diagram |
| expand | Expand a diagram or image |
| follow | Follow (logs) |
| zoom-in, zoom-out, fit | The viewer |
| reload | Banners' Try again |
| file | Side panel rows (by format: md, json, csv, log, code, text) |
| window | New window |
| settings | Settings |

Native menus (the tab, document and path menus, built by main) stay text only.

## 6. Where the new controls go

As accepted in the [mouse paths review](mouse-paths.md#changes-for-a-later-release), drawn with this
scale:

- `▦`, `⌕` Search tabs and `⋯` Commands at the bar's far right, before the window controls; `+` after
  the last tab (both layouts; with tabs on the left all of them sit in the title bar, never in the
  panel). This amends the review's placement (owner, 2026-11-05).
- Settings and New window: the profile menu (§4).
- The tab's right-click menu (tab, side panel row, collapsed marker, overview card): Close tab ·
  Reopen closed tab · Move to new window · Move to window… · Copy path · Reveal in Files · Pin tab /
  Unpin tab.
- The document's right-click menu gains Back · Forward · Find… · Reload · Edit / Save (built by
  main), and Expand all · Collapse all · Copy JSON path in a JSON tree.
- The status bar: the view menu, Follow, and click-to-reset on zoom and width (§4).
- A code block's Copy button: top right of the block, on hover and on keyboard focus (UX §6 already
  promises it), an icon button with "Copy code" as its name.
- The viewer's Save: beside zoom and fit, `download` icon, "Save diagram…".
