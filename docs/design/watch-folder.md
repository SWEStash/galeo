# Watch a folder (v0.8)

galeo watches one folder per window and lists the files created or changed there, so the reports an agent or a
build writes can be opened as they arrive. It lists and opens on request; it is not a file browser or a vault
(PRD Non-Goals). Issue [#49](https://github.com/SWEStash/galeo/issues/49); access rules in
[ADR-034](../decisions/ADR-034-watching-a-folder.md).

The owner picked the direction from a clickable prototype (2026-11-07): **a panel on the right**, like the
Outline, **plus a count on a title-bar button** while the panel is closed. A watched folder **comes back after a
restart**, with its window.

## Flow

```
galeo --watch <dir> ──┐
palette: Watch folder… ─→ folder picker ─→ [Watching: panel opens, empty] ─→ files arrive ─→ [List]
                                                │                                  │
                                         Cancel: nothing                 click / Enter: opens a tab
                                                                                   │
                     [Folder missing] ←── folder deleted or renamed          Stop watching: [Not watching]
```

- `galeo --watch <dir>`: the window opening for the command watches `<dir>` (an existing window of the profile
  when one is running, as files do). Files can be given too, after `--` (SR-13).
- Palette: *Watch folder…* opens the system's folder picker; *Stop watching* and *Toggle watched folder* follow.
- One folder per window: watching another replaces it.

## Screens

### Watched folder panel

1. **Purpose**: see what arrived in the folder and open it.
2. **Arrives from → leads to**: `--watch`, *Watch folder…*, the title-bar button, the status-bar item or
   Ctrl+Shift+D → opening a file (a tab, or the tab already showing it), *Stop watching*, closing the panel.
3. **Content hierarchy**:
   - Header: "Watching" and the folder, shortened from the home folder (`~/git/acme/.local/reports`); a close
     button.
   - The list, newest first: a mark (green *new*, amber *changed*, an outline once opened), the file name, *new
     · 14:12* or *changed · 14:15*, and the folder inside the watched one (`reviews/`, or `./`).
   - Footer: *Open all new* (opens each unopened file as a tab, oldest first; asks first past 20) and *Stop watching*.
4. **States**:
   - Empty (just started, nothing yet): "Nothing new yet. Files created or changed in this folder show up here
     as they arrive."
   - List: up to 200 entries; past that the oldest go, and the footer says "Showing the newest 200".
   - Folder missing (deleted or renamed): "The folder is gone." with *Stop watching*; the list stays; it resumes
     if the folder comes back.
   - No permission to read the folder: "galeo can't read this folder." with *Stop watching*.
   - Watched by polling (a folder the system can't watch, as for open files): the header says "checked every
     few seconds".
5. **Interactions**:
   - Click or Enter opens; Ctrl+Enter or a middle click opens in a new window, as quick open does.
   - ↑/↓ move between entries; the list is a listbox, each entry read as "review-auth.md, new, 14:12, in
     reviews".
   - An opened entry stays, marked opened; a later change marks it *changed* again. A changed file that is open
     in a tab reloads there as usual (live reload), and its entry is marked opened.
   - The panel sits on the right in both tab layouts. The Outline panel shares the right side: opening one
     closes the other (open question: side by side).
   - Width as the Outline's; the panel's open state is kept per window with the session.

### Title-bar button

1. **Purpose**: find the panel, and see that something arrived while it is closed.
2. **Arrives from → leads to**: present while the window watches a folder → toggles the panel.
3. **Content**: a folder icon among `▦ ⌕ ⋯`; while the panel is closed, a count of the entries not opened yet.
4. **States**: hidden when not watching; no count at 0 or while the panel is open.
5. **Interactions**: tooltip "Watched folder (Ctrl+Shift+D)"; its name reads the count ("Watched folder, 3
   new").

### Status-bar item

- "Watching reports/ · 3 new" (the folder's own name); click toggles the panel. Hidden when not watching.

### Folder picker

- The system dialog, folders only, starting in the shown file's folder. Cancel changes nothing.

## Which files count

- Files created or changed **after** watching starts (a restart starts afresh); files that were there before
  aren't listed.
- Only types galeo opens (its format registry); others are left out.
- Subfolders to 4 levels; the quick-open skip list (`.git`, `node_modules` and the rest, plus the setting) and
  symlinked folders aren't entered; nothing outside the watched folder is listed.
- A burst of changes to one file is one entry (the watcher's coalescing).

## Keys

| Action | Key |
|---|---|
| Toggle watched folder panel | Ctrl+Shift+D |
| Open the entry | Enter (Ctrl+Enter: new window) |

## Accessibility

- The panel is a landmark ("Watched folder"); new entries are announced politely ("review-auth.md, new"), at
  most one announcement per second.
- Marks are never the only signal: each entry says *new*, *changed* or *opened* in text.
