# Using galeo

galeo reads Markdown, plain text and log files: the plans, notes and logs that coding agents
write. It never connects to the network. This guide covers everyday use on Linux (Ubuntu 26.04,
GNOME); the full keyboard map is in the [UX specification](design/ux.md#5-keyboard-map).

## Opening files

- **From a terminal**: `galeo file.md`, or several files at once. Flags can come before the files:

  ```sh
  galeo notes.md plan.md
  galeo --new-window plan.md          # a new window instead of the last one used
  galeo --profile acme plan.md        # the "acme" profile (created on first use)
  galeo -- -odd-name.md               # after --, everything is a file
  ```

  `galeo` with no files brings the last window used forward (or opens an empty one).
- **From Files**: double-click, or *Open With → galeo*. galeo can be the default app for
  `.md`, `.txt` and `.log` files.
- **Drag and drop**: drop files from Files onto the document (they open after the tab shown) or
  onto the tab bar (they open where the caret is). Dropping a folder opens quick open on it.
- **Quick open** (Ctrl+P, or the `+` in the tab bar): type part of a file name to search the open
  tabs, recent files and the repository of the file shown. Type `~/` or `/` to browse any folder.
  Enter opens the file; Ctrl+Enter opens it in a new window.

A file already open in the window gets focused, not opened twice. A path that doesn't exist opens
as a *missing* tab, which fills in by itself once the file is written.

### Which window a file goes to

Without `--profile` or `--new-window`, files open in the **last galeo window you used**, in any
profile; with `--profile NAME`, in that profile's last window, starting the profile if it isn't
running.

On GNOME Wayland an application can't tell which workspace you're on. If the last window you used
sits on another workspace, galeo adds the tabs there without moving you: GNOME shows a
"galeo is ready" notice and the taskbar entry asks for attention. Use `--new-window` (or drag
the file into the window in front of you) when you want it here.

## Reading

- **Live reload**: a file that changes on disk updates in place and keeps your place; the tab
  shows `↻` for a moment. F5 or Ctrl+R reloads by hand.
- **Views**: Ctrl+U switches a Markdown file between rendered and source; Alt+Z toggles wrapping;
  logs open in source view, and End follows the end of a growing log.
- **Find** (Ctrl+F), **outline** (Ctrl+Shift+O), **zoom** per tab (Ctrl++ or Ctrl+= / Ctrl+- /
  Ctrl+0, or Ctrl and the wheel), and every command by name in the **palette** (Ctrl+Shift+P).
- **Status bar**: the path (click to copy it or reveal it in Files), the view, the encoding, the
  line count (in the source view) and, for Markdown and `.txt`, the word count and reading time.
  Markdown counts its prose only: code blocks, math, diagrams and front matter aren't words.
- **Diagrams and math**: math is typeset with the document (KaTeX); Mermaid diagrams draw as you
  scroll towards them. A diagram that can't be drawn (a syntax error, or over 200 edges) shows its
  error and its source. A diagram too wide for the column scrolls sideways; its ⤢ button (shown
  on hover, or reached with Tab) opens it in a viewer: + and − or the wheel zoom, drag or the
  arrow keys pan, 0 fits it, 1 shows it at 100 %, Esc closes. Images open in the same viewer: click
  one, or use its ⤢ button (a linked image follows its link on click; icons don't offer it). In dark mode, a diagram that sets
  its own colours is drawn as written, on a light panel.
- **Large or slow documents**: Markdown over 5 MB, or that takes more than 2 s to render, opens as
  source with a banner; **Render anyway** renders it (and waits up to a minute).
- **A document that crashed the window**: the window comes back with its tabs, and that tab shows
  a notice instead of rendering again. *Try again* renders it; *Open as source* shows its text. A
  window that crashes 3 times within a minute stops reloading and says so: *Try again* brings its
  tabs back, *Close window* closes it.

## Tabs, windows and sessions

Tabs and windows work like a browser's: Ctrl+Tab to cycle, Ctrl+W to close, Ctrl+Shift+T to
reopen what you closed last, Ctrl+N for a new window. Closing a profile's last window, or quitting
(Ctrl+Shift+Q), keeps its session: next time its windows and tabs come back where you left them.
"Restore previous session" (palette or profile menu) goes back to one of the last three.

## Profiles

A profile is a separate set of windows, session, recent files and settings, for example one per
client or project. The profile chip at the left of the tab bar (Ctrl+Shift+M) lists them and
creates, renames, recolours or deletes them. `galeo --profile NAME` creates a profile on first use,
with an Undo. The `default` profile can't be deleted; deleting another removes its session and
settings, never your files.

## Settings and custom CSS

Settings (Ctrl+,) apply to all profiles or to the current one only, as the switch at the top
says. galeo keeps its files in the usual places:

| What | Where |
|---|---|
| Settings for all profiles, and their custom CSS | `~/.config/galeo/settings.json`, `custom.css` |
| A profile's own settings and custom CSS | `~/.config/galeo/profiles/<id>/profile.json`, `custom.css` |
| Sessions and recent files | `~/.local/state/galeo/` |
| Caches | `~/.cache/galeo/` |

Hand edits to these files apply at once. A file left invalid is not overwritten: galeo keeps
using the last valid settings and says which file is wrong. [Document styling](design/document-styling.md)
lists the CSS variables and classes a custom CSS can rely on.

## Privacy

galeo makes no network connections: remote images show as a placeholder with their host, and
links to the web open in your browser only when you click them. Documents can't run scripts.

## Troubleshooting

- **"Sandbox unavailable" at startup**: Chromium's sandbox needs a permission Ubuntu grants only
  through the AppArmor profile the `.deb` installs. The AppImage can't have one: install the
  `.deb`, or run the AppImage unsandboxed for that launch (the window says so while it runs).
- **`Fontconfig warning: We will not regenerate the cache…`** in the terminal: another app with a
  newer Fontconfig (for example Chrome 154) left cache files galeo's older one doesn't read.
  It's harmless and costs no measurable startup time. Deleting the `*.cache-10` and `*.cache-11`
  links in `~/.cache/fontconfig` silences it until that app writes them again.
- **`vaInitialize failed: unknown libva error`** in the terminal: Chromium looking for a hardware
  video decoder. galeo plays no video; it's harmless.
