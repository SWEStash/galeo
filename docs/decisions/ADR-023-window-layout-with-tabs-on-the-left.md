# ADR-023 — Window layout with tabs on the left

- Status: Accepted (2026-10-22, owner)
- Date: 2026-10-22
- Deciders: project owner
- Builds on: [ADR-006](ADR-006-renderer-ui-framework.md) (the frameless window and its drag region),
  [ADR-019](ADR-019-moving-tabs-between-windows.md) (tab drags, tear-off, point 9: the whole tab bar takes the
  drop), [ADR-022](ADR-022-drag-tokens.md) (the drag token), [ADR-005](ADR-005-profiles-and-session-persistence.md)
  (settings per profile). Supersedes nothing.

## Context

UX F18 lets a profile put its tabs in a list on the window's left, so long file names and many tabs stay
readable. Today the tab bar is also the title bar. The window is frameless. The tab bar's empty space and a
grip at its end drag the window. The native window controls are drawn over its right end, 36 px tall
(`titleBarOverlay`). It is also where tabs are dropped, reordered, adopted from other windows and dragged out
to new windows.

Moving the tabs therefore raises four questions:
- What keeps the title bar's jobs?
- Where does the panel go?
- How do the drag rules carry over?
- Where do the settings live?

Main has no geometry in any of this. Tear-off is the page's "the pointer left the window" plus "no window
claimed the drag". Moves and adopts are by index. So the answers are all in the page.

## Decision

1. **The title bar stays at the top, full width, 36 px.** With tabs on the left it holds:
   - the panel button, at the left end above the panel (after the window buttons on macOS). It collapses and
     expands the panel (point 7). It is a toggle button with `aria-expanded`, named "Collapse tab panel" or
     "Expand tab panel", and its tooltip names Ctrl+Shift+B;
   - the profile chip;
   - the new-tab button `+`;
   - the tab overview button ▦;
   - the shown tab's name and folder ("plan.md — ~/docs"), centred, dimmed and elided ("Settings" for the
     Settings tab, nothing in an empty window);
   - the grip;
   - the native controls.

   The name and folder are `aria-hidden`, since the window title already says them. The title bar's empty
   space, including the name, drags the window, as before. The window controls overlay, its height and the
   modals that keep clear of it are unchanged.
2. **Below the title bar comes a row: the side panel, a divider, then the document column.** The notices
   and the documents are in the document column. The status bar stays full width at the bottom.
3. **The side panel is a vertical tab list.**
   - Each tab is a row of two lines:
     - The first line has the file name, its indicators and ✕. The ✕ shows as in the tab bar.
     - The second line has the shortened folder.
     - The tooltip has the full path.
   - The folder line tells apart tabs with the same name, so the name stays just the file name. The tab bar
     adds a folder instead.
   - The Settings tab is a single line, "Settings".
   - It is the same ARIA tablist with `aria-orientation="vertical"`:
     - ↑/↓ move between tabs, Home/End go to the first and last, and Enter or a click shows a tab.
     - Delete, middle-click and dragging work as in the tab bar.
   - The panel scrolls natively when the tabs don't fit, and keeps the shown tab in view. There are no ‹ ›
     buttons and no wheel remapping.
   - An empty window's panel is empty and still takes drops.
4. **Drags work as in the tab bar.**
   - The whole panel takes the drop, including the space below the last row and an empty window's panel.
     This is ADR-019 point 9, with the panel in place of the bar.
   - The insertion caret is a horizontal line between rows, or between markers when collapsed.
   - Rows and markers are drag sources.
   - Reorder, file drops, adopting another window's tab (by token, ADR-022) and tear-off use the same code
     as the tab bar, by index.
   - The panel is never a window drag region, so nothing needs to switch off there during a drag.
   - The title bar keeps ADR-019's rule: while a tab drag is pending, its empty space stops being a drag
     region, so passing over it doesn't count as leaving the window.
5. **Two settings, per profile like the theme.**
   - `tabsPosition`: `'top'` (default) or `'left'`.
   - `tabPanelWidth`: whole pixels, 140–480, default 220.

   Both apply live. A window too narrow for the panel and 320 px of document draws the panel narrower without
   changing the setting.

   The palette's *Put tabs on the left* / *Put tabs on top* switches `tabsPosition` for the window's
   profile, as the Settings tab does.
6. **The divider sets the width.**
   - It is a window splitter (`role="separator"`, `aria-orientation="vertical"`, named "Resize tab panel").
     Its value is the width, read as "220 pixels".
   - It sits in the Tab order between the tab list and the document.
   - Dragging it changes the width live, between 140 and 480 px.
   - Keys: ←/→ change the width by 16 px, and Home resets it to the default (as a double-click does).
     Enter collapses and expands the panel.
   - It writes the setting once, when the gesture ends: pointer up, a key, or a reset.
   - **Dragging it under 100 px snaps the panel to collapsed** and leaves the stored width as it was.
     Dragging the collapsed panel's edge out past 100 px expands it to where the pointer is.
7. **The panel collapses; it never disappears.** The panel button, Enter on the divider, Ctrl+Shift+B and
   the drag in point 6 collapse and expand it.
   - Collapsed, the panel is 32 px wide, and the divider stays at its edge.
   - Each tab is a marker of at least 24 × 24 px, with the name's first letter (⚙ for Settings).
   - The shown tab's marker is filled, not only coloured.
   - A marker shows one mark, in this order: crashed or missing file, then unsaved, then following the end.
     Its tooltip and its accessible name keep the full name, folder and every indicator, as in a row.
   - The tooltip shows on hover and on keyboard focus (react-aria `Tooltip`). Keyboard users can then see
     which tab a marker is before showing it.
   - Collapsing and expanding keep focus where it was. A focused row becomes its marker. Collapsing is not
     animated.
   - Ctrl+Shift+B puts "Tab panel collapsed" or "Tab panel expanded" in the status line. A screen reader
     hears it wherever focus is.
   - The state is per window and lasts until the window closes. It is not a setting. Switching to the
     horizontal tab bar and back expands the panel again.
   - With the horizontal tab bar, there is no panel button, and Ctrl+Shift+B says in the status line that it
     works only with tabs on the left.
8. **With the horizontal tab bar (the default), nothing changes from v0.3.**

## Options considered

| Option | For | Against |
|---|---|---|
| **Slim title bar on top, panel below it (chosen)** | Window controls, overlay height and drag region stay as they are; one layout for both settings above the document | The title bar spends 36 px across the panel too |
| Panel full height, title bar only over the document | Panel gains a row | The controls overlay is window-wide on Linux; the chip and buttons would need a new home; two drag regions |
| Chip and buttons at the top of the panel, no title bar | Saves vertical space | Hiding the panel hides the chip, `+` and the window's drag handle; native controls still need a strip |
| Title bar empty but for the controls | Simplest | A bare 36 px strip; the owner chose the name and folder |
| Hide the panel entirely | Most room for the document | Switching tabs then needs keys or the overview; the owner wants the tabs always reachable |
| Collapse to 20 px | Thinnest | Room for a dot only: tabs can't be told apart without hovering |

## Consequences

- `TabBar` splits into the title bar shell and a strip that takes an axis, shared by both layouts. The drop
  position calculation takes an axis.
- `Settings` gains two keys (schema, defaults, IPC zod, Settings tab). `settings.set` accepts them like any
  other key, so this adds no new channel. The palette command writes through the same `settings.set`.
- The collapsed markers use react-aria's `Tooltip`, part of the already adopted react-aria-components; no new
  dependency.
- New Wayland and Orca validation rows for the vertical list: reorder, a drag between a left and a top
  window, tear-off, the title bar drag, and the list's orientation and names.

## Revisit triggers

- Tabs on the right, or grouped or tree tabs, are asked for.
- A platform needs the window controls on the left, or a title bar of another height.
- Remembering a collapsed panel across restarts is asked for.
