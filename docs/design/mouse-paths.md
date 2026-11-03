# Mouse paths review (v0.5)

- Date: 2026-11-02
- Status: accepted by the owner (2026-11-02), with one proposal turned down (the mouse's back and forward
  buttons)
- Scope: every command in the palette (`COMMANDS` in `src/shared/commands.ts`, 56 entries). For each:
  - how a mouse user reaches it today;
  - whether it should get a control or menu entry, and why;
  - where that goes with the tabs on top and with the tabs on the left
    ([ADR-023](../decisions/ADR-023-window-layout-with-tabs-on-the-left.md)).
- Nothing here is built in v0.5. The accepted changes are listed at the end and go to a later release.

## What a mouse user has today

Every control below was found in the code (paths are from `src/renderer/` unless they say otherwise).

| Surface | Mouse controls |
|---|---|
| Tab bar, or the title bar with tabs on the left | A tab: click shows it; ✕ or a middle-click closes it; a drag reorders it, moves it to another window or, dropped outside every window, to a new one (`tabs/TabStrip.tsx`). `+` opens quick open, `▦` the tab overview (`tabs/TabBar.tsx:120`, `:125`). With tabs on the left, `◧` collapses or expands the panel (`TabBar.tsx:101`); the divider drags, and a double-click resets its width (`tabs/SidePanel.tsx:153`). `‹` `›` and the wheel scroll an overflowing strip. The window controls (`main/window/factory.ts:54`) |
| Profile chip | Profiles (open one), New / Edit / Delete profile…, About galeo, Restore previous session (`profiles/ProfileChip.tsx:85`) |
| Status bar | The path: Copy path, Reveal in Files (`tabs/StatusBar.tsx:45`, main's menu). The encoding: Reopen with encoding. A table's options: separator, header, reset (`document/TableOptionsMenu.tsx`). The view, mode, metrics, zoom and width are text only |
| Document | Right-click: Open with default app, Reveal in Files, Copy path (`tabs/TabDocument.tsx:229`, `core/documents/menus.ts`). Links follow on click. Ctrl+wheel zooms (`app/useTabShortcuts.ts:41`). JSON tree nodes open and close on their arrow or a double-click (`document/json-tree-view.ts:218`). Banners offer their own buttons (Show as table, Render anyway, Try again) |
| Overlays | Find bar: previous, next, match case, replace (edit mode) (`document/FindBar.tsx`). Viewer: zoom, fit, 100 %, close. Outline: a click goes to the heading. Empty window: recent files, restore a session |

Following a log starts only with End. UX F10 also said a click on `⇣` started it, but `⇣` is the
indicator shown while following and has no click; F10 was corrected with this review.

What's missing:
- **The command palette has no mouse path.** It opens only with Ctrl+Shift+P, so "every command is in the palette" doesn't help a mouse user.
- **Settings has no mouse path** (Ctrl+, or the palette only).
- **Tabs have no right-click menu.**

## Criteria

A command gets a control or a menu entry when a reader using the mouse would look for it while reading,
and one of these holds:
- it's used often;
- without it the feature can't be found at all.

It doesn't get one when it is:
- already one click away another way;
- rare;
- covered by the window manager;
- something that would crowd the bar galeo keeps for the content (UX §1).

Two constraints hold for every placement:
- the title bar always keeps an area that drags the window;
- the collapsed side panel stays 32 px wide.

Commands that run only by main's key (edit mode, ADR-004 and ADR-013) never get a control in the page.
Main may offer them in a menu it builds itself, like the path menu.

## Every command

"Today" names the mouse path, or *none*. "Proposal" is **add** (with where), **covered** (today's path is
enough) or **no** (with the reason).

### File

| Command | Keys | Today | Proposal |
|---|---|---|---|
| Quick open | Ctrl+P | `+` in the tab bar | covered |
| Reload from disk | F5, Ctrl+R | none | **add** to the document's right-click menu. Live reload makes it rare, but a reader who doubts what's shown looks there |
| Toggle edit mode | Ctrl+E (main's key) | none | **add** "Edit" to the document's right-click menu, built by main, which keeps the capability with main (a native menu click is the user's own input) |
| Save | Ctrl+S | none (the close prompt saves) | **add** "Save" to the same menu while editing |

### Find

| Command | Keys | Today | Proposal |
|---|---|---|---|
| Find | Ctrl+F | none | **add** "Find…" to the document's right-click menu |
| Find next / previous | F3 / Shift+F3 | the find bar's ↓ ↑ | covered |
| Find and replace | Ctrl+H | the find bar in edit mode | covered once edit mode has a mouse path |
| Find in all tabs | Ctrl+Shift+F | none | no control of its own: the palette button reaches it (below). It's a power feature, and a fourth bar button would crowd the bar |

### View

| Command | Keys | Today | Proposal |
|---|---|---|---|
| Toggle source view | Ctrl+U | none | **add**: the status bar's view name becomes a menu: Rendered / Source / Split, Wrap, Outline, each only where it applies |
| Toggle split view | Ctrl+\ | none | **add**, in that menu |
| Toggle wrap | Alt+Z | none | **add**, in that menu (source and log views) |
| Toggle outline | Ctrl+Shift+O | none | **add**, in that menu |
| Follow end (logs) | End | none (scrolling to the end doesn't follow) | **add** a "Follow" toggle in the status bar, logs only. Following is how a log is read, and today the mouse can't start it |
| Zoom in / out | Ctrl++ / Ctrl+- | Ctrl+wheel | covered |
| Reset zoom | Ctrl+0 | none | **add**: a click on the status bar's zoom (shown only away from 100 %) resets it |
| Widen / narrow reader | Alt++ / Alt+- | none | no: rare, set once in Settings; the palette button reaches it |
| Reset reader width | Alt+0 | none | **add**: a click on the status bar's width (shown only when it differs) resets it |
| Full width | palette | none | no: the palette button reaches it |
| Expand all / Collapse all nodes | palette | node arrows only | **add** to the document's right-click menu in a JSON tree |
| Copy JSON path | palette | none | **add** to that menu, for the focused node |
| Table separator ×5, First row is a header, Reset table options | palette | the status bar's Table options | covered |
| Show as table | palette | the banner's button | covered |

### Go

| Command | Keys | Today | Proposal |
|---|---|---|---|
| Back / Forward | Alt+← / Alt+→ | none | **add** Back / Forward to the document's right-click menu when there is history. The mouse's own back and forward buttons were proposed too; the owner turned them down (2026-11-02) |

### Tabs

| Command | Keys | Today | Proposal |
|---|---|---|---|
| Close tab | Ctrl+W | ✕, middle-click | covered; also in the tab's right-click menu |
| Reopen closed tab or window | Ctrl+Shift+T | none | **add** to the tab's right-click menu |
| Search tabs | Ctrl+Shift+A | none | **add** a `⌕` button beside `+` and `▦` (the owner's example) |
| Tab overview | Ctrl+Shift+E | `▦` | covered |
| Collapse or expand tab panel | Ctrl+Shift+B | `◧`, the divider | covered |
| Put tabs on the left / on top | palette | Settings | covered once Settings has a mouse path |
| Next / previous tab, Go to tab 1–8, Go to last tab | Ctrl+Tab…, Ctrl+1–9 | click the tab | covered |
| Move tab left / right | Ctrl+Shift+PgUp / PgDn | drag the tab | covered |
| Move tab to new window | palette | drag the tab out | covered; also in the tab's right-click menu, since a drag out is hard to discover |
| Move tab to window… | palette | drag to the other window | covered; also in the tab's right-click menu |

### Window

| Command | Keys | Today | Proposal |
|---|---|---|---|
| New window | Ctrl+N | none | **add** "New window" to the profile menu (it opens one in the same profile) |
| Close window | Ctrl+Shift+W | the window's ✕ | covered |
| Full screen | F11 | none (maximise is the window manager's) | no: the window manager covers it |

### App

| Command | Keys | Today | Proposal |
|---|---|---|---|
| Command palette | Ctrl+Shift+P | none | **add** a `⋯` button ("Commands") at the end of the bar's buttons: one click reaches every command, which covers the rest of this list |
| Profile menu | Ctrl+Shift+M | the profile chip | covered |
| Settings | Ctrl+, | none | **add** "Settings" to the profile menu, and to the `⋯` button's list (the palette) |
| Quit | Ctrl+Shift+Q | closing the last window (Linux, Windows) | covered |

## New controls

### Tabs on top

```
┌────────────────────────────────────────────────────────────────────────────────┐
│▌acme │ plan.md │ handoff.md ✕ │ agent.log ⇣ │  + ▦ ⌕ ⋯  ░░░ grip ░░░   ─ □ ✕ │
├────────────────────────────────────────────────────────────────────────────────┤
│            document          (right-click: Back · Forward · Find… · Reload ·   │
│                               Edit/Save · Open with default app · Reveal ·      │
│                               Copy path; in a JSON tree also Expand all ·        │
│                               Collapse all · Copy JSON path)                     │
├────────────────────────────────────────────────────────────────────────────────┤
│ ~/plan.md  [Rendered ▾]  Read-only  UTF-8  412 ln · 2,310 words  [110 %]  [⇣ Follow] │
└────────────────────────────────────────────────────────────────────────────────┘
```

`⌕` and `⋯` follow `+` and `▦` after the last tab, so the grip keeps its place and its width.

### Tabs on the left

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ ◧ ▌acme  + ▦ ⌕ ⋯   plan.md — ~/notes  ░░░░ drags the window ░░░░      ─ □ ✕ │
├──────────────┬─────────────────────────────────────────────────────────────────┤
│ plan.md      │                                                                 │
│  ~/notes     │   document                                                      │
│ handoff.md   │                                                                 │
│  ~/notes     │                                                                 │
├──────────────┴─────────────────────────────────────────────────────────────────┤
│ status bar as above                                                            │
└────────────────────────────────────────────────────────────────────────────────┘
```

The new buttons go in the title bar, not in the panel, so the collapsed panel stays 32 px wide.

The tab's right-click menu works the same on a tab, a row and a collapsed marker:
- Close tab
- Reopen closed tab
- Move to new window
- Move to window…
- Copy path
- Reveal in Files

## Changes for a later release

1. `⋯` Commands button (opens the palette) and `⌕` Search tabs button, in the bar or title bar.
2. Settings and New window in the profile menu.
3. A right-click menu on tabs, rows and markers.
4. More entries in the document's right-click menu, which main builds (Edit and Save need a note in the
   threat model, since they reach main's edit capability):
   - Back / Forward;
   - Find…;
   - Reload;
   - Edit / Save;
   - in a JSON tree: Expand all, Collapse all, Copy JSON path.
5. Status bar:
   - the view menu;
   - Follow for logs;
   - a click on zoom or width resets it.
