# galeo — UX specification

- **Status**: Approved (2026-09-26)
- **Date**: 2026-09-25 (updated 2026-09-26; v0.3 additions 2026-10-15)
- **Covers**: v0.1 "reader" (and v0.2 "editor", v0.3 "formats" where marked)
- **Related**: [PRD](../PRD.md) · ADRs [001](../decisions/ADR-001-app-shell-stack.md)–[008](../decisions/ADR-008-packaging-and-distribution.md)
  (notably [002](../decisions/ADR-002-window-and-tab-model.md), [004](../decisions/ADR-004-security-and-zero-network.md),
  [005](../decisions/ADR-005-profiles-and-session-persistence.md), [006](../decisions/ADR-006-renderer-ui-framework.md)) ·
  [Threat model](../security/threat-model.md)

This document defines *what the user sees and does*: surfaces, flows, states, the keyboard map,
theming and accessibility. It does not choose libraries or internal structure (those belong to
ADR-002…007).

## 1. Design principles

1. **A browser tab for documents.** Opening, switching and closing feel like Chrome: instant,
   predictable, keyboard-first. If a behaviour exists in Chrome, copy its semantics unless there
   is a reason not to.
2. **Reading first, chrome last.** The document owns the window. UI is one tab bar and one slim
   status bar; everything else is summoned (palette, find, outline) and dismissed with Esc.
3. **Never lose my place.** Scroll position survives tab switches, hibernation, live reload,
   restarts and file renames that come back.
4. **Never surprise-write.** Read-only is the default; nothing is ever written into user folders
   without an explicit save (v0.2).
5. **Quiet, honest states.** Every file condition (missing, binary, huge, blocked remote image)
   has a clear, calm state with a next action — never a blank pane or a crash.
6. **No perceived waiting.** Nothing shows a spinner under 150 ms; work that may exceed it shows a
   skeleton, never a modal.

## 2. Surfaces

```
┌──────────────────────────────────────────────────────────────────────────┐
│▌acme │ plan.md ● │ handoff.md │ agent.log ⇣ │ ADR-003.md ✕ │ +     ─ □ ✕ │  ← tab bar (title bar)
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│            # Execution plan                                              │
│            Lorem ipsum… (reading column, centred, ~72ch)                 │  ← document area
│                                                                          │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│ ~/plan.md  Source · Read-only  UTF-8  412 ln · 2,310 words · 10 min      │  ← status bar
└──────────────────────────────────────────────────────────────────────────┘
```

| Surface | Role | Summon / dismiss |
|---|---|---|
| **Tab bar** (merged with title bar, client-side decorations) | Profile chip (name + accent colour, left edge), tabs, new-tab button, window controls | Always visible |
| **Document area** | Rendered or source view of the active tab | Always visible |
| **Status bar** | Path (click → copy menu), view mode, read-only/edit state, encoding, the document's metrics: line count (source and log views only: the rendered and reader views wrap to the window), word count and reading time (Markdown prose — not code, math, diagrams or front matter — and `.txt`; about 230 words a minute), live-reload indicator; (v0.3) a table's options (separator and header, a menu); the tab's zoom when it isn't 100 % and (v0.3) its reader width when it differs from the setting ("96 ch", "Full width") | Always visible; can be hidden in settings |
| **Quick open** | Fuzzy file finder: open tabs, recent files, repo of active file | Ctrl+P / Esc |
| **Command palette** | Every command by name, with its shortcut; also "About galeo" (version, licence, third-party notices), which v0.3 adds to the profile menu and Settings | Ctrl+Shift+P / Esc |
| **Find bar** | In-document search, top-right overlay | Ctrl+F / Esc |
| **Outline panel** | Heading tree of the active Markdown document (top-level keys for YAML and TOML), right side | Ctrl+Shift+O (toggle) |
| **Viewer** (diagrams and images) | One Mermaid diagram or document image filling the window, fitted: zoom (− / + buttons and keys, the wheel around the pointer), pan (drag, arrows), 0 fits, 1 shows it at 100 % | A diagram's or image's ⤢ Expand button (on hover or keyboard focus), or a click on an image that isn't a link; images smaller than 48 px both ways (icons, badges) don't offer it / Esc, focus back on the button (owner, 2026-10-06) |
| **Profile menu** | Switch / new / rename / delete profile, open profile settings, About galeo (v0.3) | Click profile chip or Ctrl+Shift+M |
| **Settings tab** | Global and per-profile settings, opened as a special tab | Ctrl+, |

**Window title** (used by GNOME's overview and Alt+Tab): `<file name> — <profile> — galeo`.

## 3. Flows

### F1 — Open from the terminal

```
$ galeo [--profile P] [--new-window] [--no-sandbox] file…
        │
        ├─ galeo not running ─→ start → profile P (or last-used, else default)
        │                            → restore P's session (hibernated) → open files as new tabs, the first one shown
        │
        └─ galeo running ──────→ forward args to running instance, command exits immediately
                                     ├─ --new-window        → new window in target profile
                                     ├─ --profile P running → last-focused window of P
                                     ├─ --profile P stopped → start P (restore) → its last-focused window
                                     └─ no profile          → last-focused galeo window (any profile)
```

- Flags may come before or after file names. After `--` everything is a file
  (`galeo -- -notes.md`), and an unknown option is refused before anything starts.
- Files already open in the target window are **focused, not duplicated**.
- A path that does not exist opens a tab in the *missing* state (so typos are visible, and the tab
  recovers if the file is created — useful when an agent is about to write it).
- `galeo` with no files: bring the target window forward (or open an empty window).
- The target window is **not** force-raised (ADR-005): if it is on another workspace, GNOME shows
  a "galeo is ready" notice and the user stays where they are. Its taskbar entry asks for
  attention until the window is focused.

### F2 — Double-click / Open With from Files

Same as F1 with no profile: goes to the last-focused galeo window, or starts the last-used
profile. Multiple selected files open as tabs in selection order.

### F3 — Drag and drop from Files

- Hover over the **document area** → the area shows a drop overlay "Open N files here".
  Drop → tabs inserted after the active tab; the first dropped becomes active.
- Hover over the **tab bar** → an insertion caret between tabs follows the pointer.
  Drop → tabs inserted at the caret.
- Dropping folders: v0.1 opens Quick open scoped to that folder (does not open every file).
- Unsupported or binary files still open, in the *can't display* state (the user learns why).
- Dragging a tab to another window, or out of every window: see F15 (v0.3).

### F4 — Tabs and the lifecycle

- New tabs open after the active tab (Chrome order). Middle-click or Ctrl+W closes;
  Ctrl+Shift+T reopens closed tabs, and after a closed window, the whole window.
- Hibernation is invisible except that a hibernated tab's label is slightly dimmed. Waking must
  land at the saved scroll position before first paint (no jump).
- Tabs with duplicate file names show the shortest distinguishing parent (`acme/plan.md`,
  `beta/plan.md`). Tooltip always shows the full path.
- Tab indicators (always icon **and** tooltip text, never colour alone):

  | Indicator | Meaning |
  |---|---|
  | `⇣` | Log in follow-end mode |
  | `↻` (brief) | Reloaded from disk just now |
  | `✕` struck label | File missing |
  | `⚠` | Crashed (not auto-rendered again) |
  | `✎` | Edit mode (v0.2) |
  | `●` | Unsaved changes (v0.2) |

### F5 — Profiles

- **Create**: `galeo --profile NAME` creates it on first use, with a toast "Created profile 'NAME' ·
  Undo" (Undo deletes it and re-routes the files), or Profile menu → New profile (name + accent
  colour picked from a preset palette; theme inherited from global).
- **Switch**: Profile menu lists running profiles (focus their last window) and stopped ones
  (start them, restoring their session).
- **Rename / recolour**: Profile menu → Edit. Renaming keeps sessions and settings.
- **Delete**: confirmation dialog naming what is lost ("the profile's session and settings; your
  files are not touched"). The `default` profile cannot be deleted.
- Closing the last window of a profile stops the profile and keeps its session for next time
  (Chrome semantics). Closing one of several windows discards that window's tabs, recoverable
  with Ctrl+Shift+T while the profile runs.
- Quitting (Ctrl+Shift+Q) closes all profiles; each restores its session next time.

### F6 — Session restore

On profile start: all windows reappear with their tabs **hibernated**, each window's active tab
rendered first. "Restore previous session" (palette and Profile menu) goes back to one of the
last 3 saved sessions. Missing files get the *missing* state (they are not removed). Window size and
position are restored where the platform allows (GNOME Wayland decides placement; workspace
placement is not restorable on Wayland).

### F7 — Live reload

- When a visible file changes: re-render in place, keep the reading position anchored to the
  nearest heading/line above the viewport top; show `↻` on the tab for ~1 s. No banner, no
  flash, no scroll jump.
- If the file is being rewritten rapidly (an agent streaming), updates are coalesced (at most a
  few per second) so reading stays stable.
- Log files in follow-end mode scroll to the new end; otherwise they stay put.
- Rename/delete → *missing* state; if the path reappears, the tab recovers automatically.
- F5 / Ctrl+R forces a re-read.

### F8 — Quick open (Ctrl+P)

```
┌ Quick open ─────────────────────────────────────────┐
│ > plan                                              │
│ OPEN TABS                                           │
│   plan.md                ~/git/acme/.local/plans    │
│ RECENT                                              │
│   v0.1-plan.md           ~/git/beta/.local/plans    │
│ IN acme (git root)                                  │
│   .local/plans/plan-old.md                          │
│   docs/decisions/ADR-003-plan.md                    │
└─────────────────────────────────────────────────────┘
```

- Opens instantly with open tabs + recent files; repo results stream in (no blocking scan).
- Scope = git root of the active tab (else its folder); shown in the section header. Includes
  git-ignored files and dot-folders. Skips folders and files named `.git`, `node_modules`, `dist`,
  `build`, `out`, `target`, `coverage`, `.venv`, `venv`, `__pycache__`, `.next` or `.cache`,
  wherever they are; the setting adds names (no ignore file, no globs in v0.1). Symlinked folders
  are not entered. The walk stops at 50 000 files, 32 levels or 3 s, and the section says so.
- ↑/↓ select, Enter opens (focuses if already open), Ctrl+Enter opens in a new window, Esc closes
  and returns focus to the document.
- Empty query shows open tabs and recent files; "no matches" shows the scope and a hint to type
  a path (`~/…` or `/…`, or a drive such as `C:\…` on Windows, jumps to arbitrary paths).
- The tab bar's `+` button opens it too ("Open file… (Ctrl+P)").

### F9 — Find in document (Ctrl+F)

Overlay at top-right with query, `n of m`, previous/next (Shift+Enter / Enter, F3 / Shift+F3),
case-sensitivity toggle. Works in rendered and source views (source view searches raw text).
Matches highlighted; the current match scrolls into the middle third of the viewport. Esc closes
and keeps the scroll position at the current match.

In edit mode, Ctrl+H opens the same bar with a replace row (v0.2): *Replace with*, *Replace*
(or Enter in that field) swaps the current match and selects the next, *Replace all* swaps every
match as one undo step and announces "Replaced N". The replacement is literal, like the query.
In split view the bar then searches the source pane, the only one replace can change. Outside
edit mode Ctrl+H opens nothing and the status bar says it needs edit mode (Ctrl+E); leaving edit
mode closes the replace row and keeps find open.

### F10 — Views

- Markdown opens **rendered**; Ctrl+U toggles **source** (read-only, line numbers, wrap).
  YAML frontmatter appears at the top as a collapsible, highlighted YAML block (shown, never
  interpreted).
  The toggle keeps the reading position (rendered block ⇄ source line).
- `.txt` opens in the **reader** view: proportional font, reading column, preserved line breaks.
- `.log` opens in the **log** view: monospace, line numbers, level highlighting
  (ERROR/WARN/INFO/DEBUG, also as text badges), follow-end mode:
  pressing End (or clicking `⇣`) enables it; scrolling up disables it.
- Alt+Z toggles line wrapping in source/log views.

### F11 — Links and navigation

- Click a relative link to a supported file → navigates **in the same tab**, with per-tab
  back/forward (Alt+← / Alt+→), like a browser. Ctrl+click or middle-click → new background tab.
- `#anchor` links scroll within the document and are part of back/forward history.
- `http(s)`/`mailto` links → open in the system browser/mail client. First time per profile, a
  one-line hint appears in the status bar ("External links open in your browser"); no dialog.
  Only links actually present in the document can be opened (ADR-004). **Burst guard**: if one
  document triggers more than 3 external opens within 10 s, a dialog asks "This document is
  opening many links. Allow?" (Allow / Block for this tab).
- Links to missing files → open a tab in the *missing* state.
- Images: local relative images render; remote images show a placeholder with the host name and
  "remote content blocked" (never fetched).

### F12 — Edit and save (v0.2)

- Ctrl+E toggles edit mode on the active tab (source view becomes editable, `✎` on tab, status bar
  says "Editing"). Ctrl+E again returns to read-only (disabled while unsaved changes exist → offers
  save/discard). A file opened from a link, a drop, quick open or recent files first asks in a
  native dialog naming its full path: *Edit* / *Cancel* (Cancel is the default), once per file
  per tab (ADR-015).
- Ctrl+S saves (atomic); status bar shows "Saved" briefly. Unsaved `●` on tab.
- Closing a tab/window/profile, or quitting, with unsaved changes → dialog: Save / Don't save / Cancel
  (focus on Save; Esc = Cancel). Closing the window or quitting again while that dialog is open →
  a native dialog from main: *Keep waiting* (default) / *Close without saving*.
- **External change while dirty** → non-modal bar above the editor: "File changed on disk" with
  *Show diff*, *Keep mine*, *Load theirs*. Nothing is overwritten until the user chooses. *Show
  diff* opens a read-only side-by-side diff (mine | theirs). A file deleted while dirty offers
  *Keep mine* and *Save again* (there is nothing on disk to diff). A file that turns into one
  that can't be shown as text offers only *Load theirs*. Ctrl+S waits for the choice.
- External change while in edit mode but clean → silently reload (same as F7).

### F13 — Split view (v0.2)

Ctrl+\ toggles source | rendered side by side (source left). Scrolling either pane keeps the
other aligned at block level; the preview updates as you type (debounced). The divider can be
dragged, or moved with the arrow keys when focused; double-click or Home resets 50/50. A window
too narrow for two panes (about 700 px) shows one view until it widens: the source while
editing, the rendered view otherwise. A preview that takes too long to render keeps the last
good one with a notice, without leaving split. In MDX files, imports are hidden and JSX components render as
labelled placeholder boxes (`<Callout>` with its props listed).

### F14 — Rich views (v0.3)

- **JSON** opens as a **tree**: the top level expanded, each node showing its key, its type and a
  short preview (`{3 keys}`, `[120 items]`, the value for strings and numbers). ↑/↓ move, →/←
  expand/collapse (or move to the child/parent), as in the ARIA tree pattern; a click focuses a
  node, and its arrow or a double-click opens or closes it. *Expand all nodes* / *Collapse all
  nodes* and *Copy JSON path* (`$.items[3].name`, the focused node's; not the file's *Copy path*)
  are commands in the palette. Find (Ctrl+F) in the tree points to the
  source view, where the whole text is searched. Ctrl+U toggles the highlighted source, keeping the place (node ⇄ line).
- Invalid JSON opens in the source view, with a banner "Not valid JSON: line L, column C" and the
  cursor at that point. Fixing it in edit mode and saving brings the tree back.
- **CSV and TSV** open as a **table**: a header row that stays in view, row numbers, cells that
  keep their text on one line (the full value in the tooltip and when the cell has focus), and
  horizontal scrolling for wide tables. Arrow keys move between cells. The separator is found
  from the first lines (comma, semicolon, tab or pipe; a `.tsv` keeps tabs), and the first row is
  the header. **Table options** in the status bar (`Auto (;) · Header`) set the separator and
  whether the first row is a header for that tab, kept with it; the palette has the same commands,
  Settings the defaults (ADR-021). `.psv` opens as a table, and the palette's *Show as table* shows
  any other text file as one. Ctrl+U shows the raw text;
  Ctrl+\ puts the table beside its source (F13), rows aligned with their lines, and the table
  follows the text while editing.
- **YAML, TOML and source code** open in the **source** view with syntax highlighting, fold
  markers in the gutter and, for YAML and TOML, an outline of the top-level keys (Ctrl+Shift+O).
- Edit mode (Ctrl+E) always edits the source; leaving it, or saving, refreshes the tree or table.
- Live reload keeps the place: the same node (by path) or row stays at the top.

### F15 — Move a tab to another window (v0.3)

- Drag a tab over **another window's tab bar** (same profile or another one), anywhere on it,
  including its empty part and the bar of a window with no tabs: the insertion caret of F3 shows;
  drop → the tab moves there, at the caret, and becomes that window's active tab. The window isn't
  raised: it is already under the pointer (ADR-019).
- Drop **outside every galeo window** → the tab opens in a new window of its profile, which stays
  open with its other tabs. The desktop places the new window. A window's only tab dropped outside
  stays where it is. Esc with the pointer outside the window counts as a drop outside.
- The tab keeps its back/forward history, view, scroll position, zoom, reader width, split and
  edit mode. Unsaved text moves with it (`●` stays); its undo history doesn't.
- Into **another profile**, the tab becomes that profile's: it is saved in that profile's session
  and takes its look. The source profile's session no longer has it.
- The window the last tab leaves closes; if it was its profile's last window, the profile stops
  (F5).
- The **Settings tab** doesn't move.
- **Keyboard**: the palette's *Move tab to new window* and *Move tab to window…* (a list of the
  other windows, named by profile and active tab) do the same, and focus the window the tab went to.

## 4. States

### Window-level

| State | What the user sees |
|---|---|
| **Empty window** (no tabs) | Centered: "Drop files here · Ctrl+P to open · Recent" with the 8 most recent files of the profile |
| **Settings file invalid** | A hand edit broke `settings.json`, `profile.json` or a session file | Non-modal notice naming the file (and line, when known): "Your file was left untouched; using the last valid settings". Actions: Open file · Dismiss |
| **Starting** | Window appears with tab bar immediately; active tab paints first; others stay hibernated |
| **Sandbox unavailable** (app-level, at startup) | Chromium's sandbox can't start (e.g. the AppImage on Ubuntu 24.04+) | A small error window naming the detected cause and the fix (on Ubuntu 24.04+: install the `.deb`). Actions: **Quit** (default) · Run without sandbox (states the risk: a malicious document could then act with your user's full permissions; applies to this launch only) |
| **Crash loop** | The window's renderer crashed 3 times within a minute | Instead of its tabs: "This window's viewer kept crashing" — galeo stopped reloading it; the tabs are kept. Actions: **Try again** (default; the tabs come back, the one being rendered marked crashed) · Close window. If even this message crashes, the window stays down |
| **Running unsandboxed** (app-level, persistent) | Started with `--no-sandbox` or "Run without sandbox" | Every window: a warning badge "Unsandboxed" in the status bar (icon + text; its tooltip explains the risk and how to go back: restart without the flag, or install the `.deb`) and " — unsandboxed" in the window title. Not dismissable |

### Document-level

| State | When | What the user sees | Actions |
|---|---|---|---|
| **Loading** | Render takes > 150 ms | Skeleton lines in the reading column (no spinner) | Past 5 s: a quiet **Cancel** under them (ADR-020) |
| **Rendering cancelled** (v0.3) | The reader pressed Cancel; the worker was restarted | Source view + banner "Rendering cancelled — showing source" | Render anyway (Markdown) · Show as table (CSV/TSV) · Try again (JSON) |
| **Loaded** | Normal | Rendered/source content | — |
| **Empty file** | 0 bytes | Muted "This file is empty" + path; auto-updates when content arrives | — |
| **Missing** | Path gone (deleted, renamed, not yet created) | Path, "File not found", last-seen time; tab label struck | Close tab · Reveal folder · Retries automatically |
| **No permission** | EACCES | "galeo can't read this file (permission denied)" | Close tab |
| **Can't display** | Binary / unsupported | "This looks like a binary file" + size + type | Open with default app (native menu; **not offered** for executables or launchers: `.desktop`, `.sh`, `.run`, AppImage, Java and Flatpak apps, executable bit, or a symlink to one) · Reveal in Files |
| **Too large to render** | Markdown > threshold (5 MB); (v0.3) JSON or CSV over its limit | Source view + banner "Large file shown as source" | Render anyway (Markdown) · Show as table (CSV/TSV, up to the 256 MB read cap; ADR-020) |
| **Not valid JSON** (v0.3) | `.json` that doesn't parse | Source view + banner "Not valid JSON: line L, column C"; cursor at the error | Edit (Ctrl+E) |
| **Rows not shown** (v0.3) | CSV/TSV with more rows than the table shows | Table + notice "Showing N of M rows" | Show source (Ctrl+U) |
| **Unknown encoding** | Invalid UTF-8, detection unsure | Content shown with replacement chars + banner naming the guessed encoding | Reopen with encoding… |
| **Partial render error** | E.g. Mermaid/KaTeX syntax error or over-limit diagram | Only the failing block shows an inline error box with the message and its source; rest renders | — |
| **Too slow to render** | Parse exceeded its budget (2 s; a CSV/TSV table 30 s, ADR-020); the worker was restarted | Source view + banner "Too slow to render — showing source" | Render anyway, or Show as table for CSV/TSV (waits up to 60 s) |
| **Crashed** | This tab was rendering when the window's renderer crashed | Tab shows `⚠`; panel "This document crashed the viewer and won't be rendered automatically" | Try again · Open as source |
| **Remote content blocked** | Remote image/iframe in Markdown | Placeholder with host name | Copy URL |

## 5. Keyboard map

Principles: Chrome-compatible where an equivalent exists; avoid Super-based and Ctrl+Alt
combinations (GNOME uses them for workspaces, terminal and the shell); every shortcut is also a
command in the palette. **Capability commands** are listed in the palette but never granted by
it (ADR-004): "Toggle edit mode" shows the hint *Press Ctrl+E*; "Open with default app" opens
the native menu on the active tab.

| Action | Shortcut | Notes |
|---|---|---|
| Quick open | Ctrl+P | Overrides print (print is not in v0.1) |
| Command palette | Ctrl+Shift+P | |
| Find / next / previous | Ctrl+F / Enter, F3 / Shift+Enter, Shift+F3 | |
| Toggle source view | Ctrl+U | Chrome's view-source key |
| Toggle wrap | Alt+Z | Source and log views |
| Toggle outline | Ctrl+Shift+O | |
| Follow end (logs) | End | Scroll up to leave |
| Reload from disk | F5 / Ctrl+R | |
| Back / forward | Alt+← / Alt+→ | Per-tab history |
| New window | Ctrl+N | Same profile |
| Close tab / window | Ctrl+W / Ctrl+Shift+W | |
| Reopen closed tab/window | Ctrl+Shift+T | |
| Next / previous tab | Ctrl+Tab / Ctrl+Shift+Tab, Ctrl+PgDn / Ctrl+PgUp | |
| Go to tab 1…8 / last | Ctrl+1…8 / Ctrl+9 | |
| Move tab left / right | Ctrl+Shift+PgUp / Ctrl+Shift+PgDn | |
| Profile menu | Ctrl+Shift+M | |
| Settings | Ctrl+, | |
| Zoom in / out / reset | Ctrl++ (or Ctrl+=) / Ctrl+- / Ctrl+0; Ctrl+wheel up / down | Per tab; scales the document, not the app. + counts with or without Shift, so it works on every layout. The wheel zooms one step per notch, wherever the pointer is; in the viewer it zooms the viewer |
| Full screen | F11 | |
| Quit | Ctrl+Shift+Q | Ctrl+Q not bound (avoid accidental quit) |
| Edit mode (v0.2) | Ctrl+E | |
| Save (v0.2) | Ctrl+S | |
| Split view (v0.2; CSV/TSV v0.3) | Ctrl+\ | Source left, rendered right; edit mode keeps it; Ctrl+U leaves it |
| Find & replace (v0.2) | Ctrl+H | Edit mode only |
| Add the next match / every match as cursors (v0.2) | Ctrl+D / Ctrl+Shift+L | Edit mode |
| Add a cursor above / below (v0.2) | Shift+Alt+↑ / Shift+Alt+↓ | Edit mode. Ctrl+Alt+↑/↓ is GNOME's (workspaces); these keys were CodeMirror's copy line up/down, which is left out |
| Add a cursor / a column of cursors (v0.2) | Ctrl+click / Alt+drag | Edit mode; Esc goes back to one cursor |
| Widen / narrow / reset reader width (v0.3) | Alt++ or Alt+= / Alt+- / Alt+0 | Per tab, like zoom (Ctrl); 8 ch steps, 40–200 ch; rendered Markdown and text only |
| Full width (v0.3) | palette | Toggles back to the setting |
| Move tab to new window / to window… (v0.3) | palette | F15 |
| Expand all nodes / Collapse all nodes / Copy JSON path (v0.3) | palette | JSON tree, F14 |
| Table separator: … / First row is a header / Reset table options / Show as table (v0.3) | palette; also the status bar's Table options | Tables, F14, ADR-021 |
| Fold / unfold the block at the cursor (v0.3) | Ctrl+Shift+[ / Ctrl+Shift+] | Source view of a highlighted file; also the gutter markers. CodeMirror's fold-all keys are Ctrl+Alt, the desktop's, so they are left out |

On macOS previews, Ctrl maps to Cmd (Electron `CmdOrCtrl`) and platform conventions apply
(Cmd+Q quits, Cmd+, opens settings). Shortcuts are customisable in a later release; v0.1 ships
this map only.

## 6. Theming and typography

- **Theme modes**: Light, Dark, Follow system (default; tracks GNOME's dark-style preference
  live). Per-profile override allowed: each window follows its own profile's mode, so two
  profiles can sit side by side in different modes. Native menus and dialogs follow the desktop.
- **Profile accent**: a colour chip at the tab bar's left edge and the active-tab underline.
  Accent is never the only cue (the profile name is always shown). It is one of 8 presets, each
  checked to stand out 3:1 on the tab bar in light and dark; a colour hand-edited into
  `profile.json` is used as it is.
- **Reading defaults** (overridable per profile): body 17 px, line-height 1.6, measure ~72ch
  centred (v0.3: widened, narrowed or made full width per tab while reading, like zoom; a tab
  left at the setting follows it when it changes), paragraph spacing ≥ 1em, proportional font for prose, monospace for code at 0.9em,
  modular heading scale; fonts vendored in the app (no web fonts), system font as fallback.
- **Code**: syntax themes follow light/dark (`github-light` / `github-dark` by default, matching
  the article preview's target site). Line numbers optional in code blocks; copy button on hover
  and on keyboard focus.
- **Custom CSS**: a global `custom.css` and one per profile, applied in that order after the
  bundled theme; changes apply live to every open tab when the file is saved (hand edits to
  `settings.json` and `profile.json` apply live too). galeo documents a small set of
  stable CSS variables and class names as the theming contract (PRD Open Question 2;
  first version: [document-styling.md](document-styling.md)). v0.1 edits
  custom CSS in the user's external editor ("Open custom CSS" in Settings).
- **Settings tab (v0.1 scope)**: theme mode, accent colour, prose font, code font, font size,
  measure, status bar visibility, quick-open exclusions, open-custom-CSS buttons. v0.3 turns the
  font fields into pickers (the bundled fonts first, then the installed families, monospace only
  for code, each with a preview line; any name can still be typed), gives the measure presets
  (Narrow 60, Normal 72, Wide 100, Full width) besides a custom value, and adds an "About galeo"
  row showing the version. A switch at the
  top says where changes go: this profile, or all profiles. Each setting shows whether its value
  is the default, all profiles' or this profile's own, with "reset to global" for the last. A
  change to a file left invalid by a hand edit is refused and names the file. The AppImage adds
  "Install command-line launcher" (`galeo` in `~/.local/bin`, and a desktop entry for that AppImage
  with its icon). It installs nothing while the galeo package is installed: that one already
  provides `galeo`, and a user entry with the same id would hide it.

## 7. Accessibility (target: WCAG 2.2 AA)

- **Semantic structure**: rendered documents keep real HTML semantics (headings, lists, tables
  with header cells, `<figure>`/`alt` for images; a Mermaid diagram is a figure named by its title
  or "Diagram", holding the drawing as an image of that name and an Expand button, with the
  source available via the source view; a diagram wider than the column scrolls sideways and
  takes keyboard focus while it does).
- **Tabs**: ARIA `tablist`/`tab`/`tabpanel`; ←/→ move between tabs when the tab bar has focus,
  Enter/Space activates, Delete closes; indicators exposed as text in the accessible name
  ("plan.md, unsaved changes").
- **Overlays** (quick open, palette, find, dialogs): dialogs trap focus and restore it to the
  document on close; quick open/palette use the combobox + listbox pattern with
  `aria-activedescendant`; Esc always closes.
- **Focus**: visible `:focus-visible` rings in every theme; F6 cycles focus between tab bar,
  document and status bar; the document area is focusable so keyboard scrolling works
  immediately after opening.
- **Announcements** (`aria-live="polite"`): find results ("3 of 12"), file reloaded, file missing,
  saved (v0.2). Errors in dialogs use `assertive`.
- **Contrast**: bundled themes and accent presets meet 4.5:1 for text and 3:1 for UI components
  and focus rings; log-level colours also carry text badges.
- **Zoom and motion**: 200% zoom keeps the reading column without horizontal scroll (code blocks
  scroll internally); honour `prefers-reduced-motion` (no animated tab transitions or reload
  pulses).
- **Validation**: axe-core checks in the e2e suite on each view; manual keyboard-only pass and an
  Orca screen-reader pass on GNOME before each release.

## 8. Open UX questions

Each is decided when the feature that needs it is built.

- [ ] Which dropped file becomes active when dropping many (current spec: the first) — decide with drag and drop.
- [x] Tab overflow with many tabs: tabs shrink to a minimum width, then the strip scrolls, keeping the
      shown tab in view; a grip at the bar's end always drags the window (decided with the tab bar,
      2026-09-28). While the tabs overflow, `‹` `›` buttons at the strip's ends scroll it, and the mouse
      wheel over the strip scrolls it sideways, never switching tabs (owner, 2026-10-06). The buttons are
      for the mouse; the keyboard has Ctrl+Tab and Ctrl+1–9.
- [x] Profile accent palette: 8 fixed presets, each 3:1 on the tab bar in both schemes; no free picker
      (decided with profiles, 2026-09-29).
- [x] `.txt` default view: reader, with Ctrl+U for the monospace source (decided with the text/log views, 2026-09-27).
- [x] Zoom per tab: it scales the tab's document only, and the status bar shows it when not 100%
      (owner, 2026-09-28).
- [x] Reader width while reading: per tab like zoom, shown in the status bar only when it differs
      from the setting (owner, 2026-10-15).
- [x] A tab dropped on another profile's window moves into that profile; tabs with unsaved
      changes may move, without their undo history (owner, 2026-10-15).
- [x] Keys for the reader width commands: Alt++ / Alt+= widen, Alt+- narrow, Alt+0 reset, as zoom
      has Ctrl; Full width from the palette only (owner, 2026-10-17).
- [x] Limits for the JSON tree and the CSV table, and how `.jsonl` opens; no outline for source code
      in v0.3 ([ADR-018](../decisions/ADR-018-rich-views-and-the-format-descriptor.md), owner, 2026-10-15).
