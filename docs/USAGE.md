# Using galeo

galeo reads and edits Markdown, plain text and log files: the plans, notes and logs that coding
agents write. It never connects to the network. This guide covers installation and everyday use on
Linux (Ubuntu 26.04, GNOME); the full keyboard map is in the
[UX specification](design/ux.md#5-keyboard-map).

## Installation

galeo is released for Linux on x86_64, as a `.deb` package and an AppImage, on the
[releases page](https://github.com/SWEStash/galeo/releases). It has no auto-update: a new release
is how fixes reach you, so watch the repository's releases to hear about them.

### The `.deb` package (Ubuntu 24.04 and later)

```sh
sudo apt install ./galeo_<version>_amd64.deb
```

It installs galeo in `/opt/galeo`, puts `galeo` and the shorter `gal` on your `PATH` (it leaves
alone a `gal` command that belongs to another package), adds galeo to *Open With* for `.md`, `.txt`
and `.log` files, and installs the AppArmor profile Chromium's sandbox needs on Ubuntu.
`sudo apt remove galeo` removes it; your settings and sessions stay in your home folder.

### The AppImage

For other distributions: make `galeo-<version>.AppImage` executable and run it. To get the
`galeo` command and a desktop entry, open Settings (Ctrl+,) and choose
**Install command-line launcher**: it writes `~/.local/bin/galeo` and an entry in your
applications, both pointing at that AppImage.

On Ubuntu 24.04 and later the AppImage can't start Chromium's sandbox, which needs an AppArmor
profile only the `.deb` provides. galeo then shows why and offers **Quit** or
**Run without sandbox**; a window running without it says *Unsandboxed* for as long as it runs.
Prefer the `.deb` there.

### Checking a download

Each release has a `SHA256SUMS` file. In the folder you downloaded to:

```sh
sha256sum --ignore-missing -c SHA256SUMS
```

Each package also carries a GitHub artifact attestation, which proves it was built by this
repository's release workflow from the tagged commit. With the [GitHub CLI](https://cli.github.com/)
2.49 or later (Ubuntu's own `gh` package may be older; GitHub's apt repository has the current one):

```sh
gh attestation verify galeo_<version>_amd64.deb --repo SWEStash/galeo
```

## Opening files

- **From a terminal**: `galeo file.md`, or several files at once. Flags can come before the files:

  ```sh
  galeo notes.md plan.md
  galeo --new-window plan.md          # a new window instead of the last one used
  galeo --profile acme plan.md        # the "acme" profile (created on first use)
  galeo -- -odd-name.md               # after --, everything is a file
  ```

  `galeo` with no files brings the last window used forward (or opens an empty one).
  The `.deb` also installs `gal`, a shorter name for the same command.
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
- **Views**: Ctrl+U switches a Markdown or JSON file between rendered (or tree) and source; Alt+Z toggles wrapping;
  logs open in source view, and End follows the end of a growing log.
- **JSON** opens as a **tree** with its top level shown. ↑/↓ move between nodes, → opens a node
  (or steps into it), ← closes it (or steps out); a click focuses a node, its arrow or a
  double-click opens or closes it. *Expand all nodes*, *Collapse all nodes* and *Copy JSON path*
  (`$.items[3].name`) are in the palette. JSON that doesn't parse opens as source, with a banner
  saying where it breaks and the cursor there; JSON over 10 MB (or 200,000 values, or nested over
  1,000 deep) opens as source. Find (Ctrl+F) works in the source view.
- **Code and data files**: YAML, TOML and source code (TypeScript, Python, Rust, Go, shell,
  C and many more) open in the source view, highlighted, and so does JSON's source. Ctrl+Shift+[ folds the block at the
  cursor and Ctrl+Shift+] unfolds it, or use the markers in the gutter. The outline of a YAML or
  TOML file lists its top-level keys (and TOML's tables).
- **Split view** (Markdown and MDX): Ctrl+\ shows the source on the left and the rendered view on the
  right; scrolling either keeps the other on the same block. Drag the divider, or focus it and use
  the arrow keys; double-click or Home puts it back at half. Ctrl+\ again goes back to the view
  you had; Ctrl+U goes to the rendered view. A window narrower than about 700 px shows one view
  until it widens. A tab keeps its split and divider across restarts.
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
- **MDX articles** (`.mdx`) render like Markdown, and nothing in them runs: imports and exports
  are hidden, a component shows as a dashed box labelled with its tag and props, with its content
  inside, and `{expressions}` show as code (comment-only ones are hidden). Lowercase HTML tags work
  as in Markdown. A syntax error opens the file as source with a banner naming the line; in split
  while editing, the last good preview stays with *Preview paused*. galeo isn't offered as the
  default app for `.mdx` files yet: open them from galeo or with `galeo`.
- **Large or slow documents**: Markdown or MDX over 5 MB, or that takes more than 2 s to render, opens as
  source with a banner; **Render anyway** renders it (and waits up to a minute).
- **A document that crashed the window**: the window comes back with its tabs, and that tab shows
  a notice instead of rendering again. *Try again* renders it; *Open as source* shows its text. A
  window that crashes 3 times within a minute stops reloading and says so: *Try again* brings its
  tabs back, *Close window* closes it.

## Editing

- **Ctrl+E** puts the shown file in edit mode: the source view takes your typing, the tab shows
  `✎`, and the status bar says *Editing*. Ctrl+E again goes back to reading. An empty file
  can't be edited. A file you opened from a link, a drop, quick open or recent files asks once,
  naming its full path, before its first edit; files you open from Files or the command line
  don't ask.
- **In split view**, edit mode keeps the rendered view beside the editor, and it follows your
  typing once you pause. If a preview takes too long to render (or can't be rendered), the last
  one stays with *Preview paused*, and the next pause tries again. Ctrl+U goes to the editor alone;
  a narrow window shows the editor.
- **Find and replace** with **Ctrl+H** in edit mode: the find bar gains a replace row. Enter or
  *Replace* swaps the current match and moves to the next; *Replace all* swaps them all, and one
  Ctrl+Z puts them back. The replacement is taken as typed.
- **Several cursors**: Ctrl+D adds the next match of the selection, Ctrl+Shift+L every match;
  Shift+Alt+↑/↓ adds a cursor above or below; Ctrl+click adds one where you click, and Alt+drag
  puts one on each line it crosses. Typing goes to all of them; Esc goes back to one.
- **Ctrl+S** saves. The file keeps its encoding, byte order mark and line endings, its
  permissions, and its symlink or hard links. The status bar says *Saved*, or why it didn't save.
- **Unsaved changes** show as `●` on the tab. Closing the tab, leaving edit mode, closing the
  window, quitting or deleting the profile asks first: *Save*, *Don't save* or *Cancel*.
- **A file that changes on disk** while you edit: with nothing unsaved, the editor takes the new
  text. With unsaved changes, your text stays and a bar says *File changed on disk*; nothing is
  saved until you choose. *Show diff* shows your text beside the file on disk, *Keep mine* lets
  the next save write over it, *Load theirs* replaces your text with it. If the file was deleted,
  the bar offers *Keep mine* or *Save again*, which writes it back with its encoding and line
  endings. A read-only file isn't saved either.
- **If the window crashes**, unsaved text you typed more than a second before comes back in its
  tab, still unsaved. galeo keeps it in memory only: never in a file of its own.

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

Builds before 0.2 kept these files under another name, and 0.2 doesn't carry them over: it starts
with default settings and an empty session.

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
