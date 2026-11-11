# Using galeo

galeo reads and edits Markdown, plain text and logs, and shows JSON, CSV, YAML, TOML, MDX and
source code: the plans, notes, logs and data that coding agents write. It never connects to the network. This guide covers installation and everyday use on
Linux (Ubuntu 26.04, GNOME), with notes where the macOS and Windows previews differ; the full
keyboard map is in the [UX specification](design/ux.md#5-keyboard-map).

## Installation

galeo is released for Linux on x86_64 and, from 0.8.0, arm64, as a `.deb` package and an AppImage, on the
[releases page](https://github.com/SWEStash/galeo/releases), and the `.deb` through galeo's own apt
repository. galeo never checks for updates itself: installed from the repository, it gets each release
with `sudo apt update && sudo apt upgrade`.

### Ubuntu and Debian (Ubuntu 24.04 and later)

Add galeo's apt repository and install it:

```sh
sudo curl -fsSLo /usr/share/keyrings/galeo-archive-keyring.asc https://swestash.github.io/galeo/apt/galeo.asc
sudo tee /etc/apt/sources.list.d/galeo.sources > /dev/null <<'EOF'
Types: deb
URIs: https://swestash.github.io/galeo/apt/
Suites: stable
Components: main
Architectures: amd64
Signed-By: /usr/share/keyrings/galeo-archive-keyring.asc
EOF
sudo apt update && sudo apt install galeo
```

On an arm64 machine (from galeo 0.8.0), write `Architectures: arm64` instead.
The key's fingerprint is `0240 8BDA 7C32 5856 C770 3ED4 716D B0EB 162F 5629`; compare it with
`gpg --show-keys /usr/share/keyrings/galeo-archive-keyring.asc`. Installing galeo replaces the
downloaded key with the one in the package, which keeps it up to date. The repository holds the
latest release only; older ones stay on the releases page.

To install a downloaded `.deb` instead, for instance after [checking it](#checking-a-download):

```sh
sudo apt install ./galeo_<version>_amd64.deb    # or _arm64.deb
```

Adding the sources file above afterwards turns on updates: from galeo 0.5.1 the package has already
put the key in place.

Up to galeo 0.7, removing galeo (`sudo apt remove galeo`) also deletes the repository's key while the
sources file stays, so installing it again fails with `NO_PUBKEY 8D6C14A47CC81C1B` (and may then ask for
an older package that is gone). Download the key again with the first command above, then
`sudo apt update && sudo apt install galeo`. From galeo 0.8, only `sudo apt purge galeo` deletes the key.

Either way, it installs galeo in `/opt/galeo`, puts `galeo` and the shorter `gal` on your `PATH` (it leaves
alone a `gal` command that belongs to another package), adds galeo to *Open With* for Markdown,
MDX, text, log, JSON, YAML, TOML, CSV and TSV files and source code (it adds an MDX file type, since
Ubuntu takes `.mdx` for a game ROM), and installs the AppArmor profile Chromium's sandbox needs on
Ubuntu.
`sudo apt remove galeo` removes it and keeps the repository's key, so installing it again works.
`sudo apt purge galeo` deletes the key too: delete `/etc/apt/sources.list.d/galeo.sources` as well, or
`apt update` reports the missing key. Your settings and sessions stay in your home folder.

### The AppImage

For other distributions: make `galeo-<version>-<arch>.AppImage` (`x86_64` or `arm64`)
executable and run it. To get the `galeo` command and a desktop entry, open Settings (Ctrl+,) and choose
**Install command-line launcher**: it writes `~/.local/bin/galeo` and an entry in your
applications, both pointing at that AppImage, and the MDX file type in `~/.local/share/mime`.
**Uninstall command-line launcher**, beside it, removes them again (a file galeo didn't write
stays, and the message names it), so deleting the AppImage afterwards leaves nothing behind.

On Ubuntu 24.04 and later the AppImage can't start Chromium's sandbox, which needs an AppArmor
profile only the `.deb` provides. galeo then shows why and offers **Quit** or
**Run without sandbox**; a window running without it says *Unsandboxed* for as long as it runs.
Prefer the `.deb` there.

### macOS and Windows previews

From galeo 0.5, releases also carry macOS and Windows builds. They are previews: checked by CI, but
unsigned and unsupported. Only the Linux packages are official.

- **macOS** (x64 and Apple silicon): a `.dmg` and a `.zip`. Drag galeo to Applications. Being
  unsigned, the first start is refused: open **System Settings → Privacy & Security** and choose
  **Open Anyway** under the message about galeo.
- **Windows** (x64 and Arm): `galeo-<version>-<arch>-setup.exe` installs galeo for your user
  only, and `galeo-<version>-<arch>-portable.exe` runs without installing. SmartScreen warns about
  an unknown publisher: choose **More info → Run anyway**.

Both add galeo to *Open With* (*Open with* in Explorer) for Markdown, MDX, text, log, JSON (and
JSON Lines), YAML, TOML, CSV, PSV and TSV files, never as their default app; the portable build adds nothing. For the
`galeo` command, choose **Install command-line launcher** in Settings (Ctrl+, or Cmd+,):

- on macOS it writes `~/.local/bin/galeo`, which macOS doesn't put on your `PATH` by itself; add
  `export PATH="$HOME/.local/bin:$PATH"` to `~/.zshrc` if the shell doesn't find it. Start galeo
  from Applications first: from the disk image or Downloads it runs from a temporary copy, and
  Settings says so;
- on Windows it writes `galeo.cmd` to `%LOCALAPPDATA%\Microsoft\WindowsApps`, which is on your
  `PATH` already. For the portable build the command runs the `.exe` where you keep it.

**Uninstall command-line launcher** removes the command again. On Windows, uninstalling galeo removes
it too, unless the file is no longer the one galeo wrote.

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

- **From a terminal**: `galeo file.md`, or several files at once. Flags can go anywhere before `--`; an unknown one is refused:

  ```sh
  galeo notes.md plan.md
  galeo --new-window plan.md          # a new window instead of the last one used
  galeo --profile acme plan.md        # the "acme" profile (created on first use)
  galeo --watch reports/              # list what arrives in reports/ (see below)
  galeo -- -odd-name.md               # after --, everything is a file
  ```

  `galeo` with no files brings the last window used forward (or opens an empty one).
  The `.deb` also installs `gal`, a shorter name for the same command.
- **From Files**: double-click, or *Open With → galeo*. galeo can be the default app for
  Markdown, MDX, text, log, JSON, YAML, TOML, CSV and TSV files and source code. In Finder and
  Explorer, *Open With* offers it for the same types except source code.
- **Drag and drop**: drop files from Files onto the document (they open after the tab shown) or
  onto the tab bar (they open where the caret is). Dropping a folder opens quick open on it.
- **Quick open** (Ctrl+P, or the `+` in the tab bar): type part of a file name to search the open
  tabs, recent files and the repository of the file shown. Type `~/` or `/` to browse any folder.
  Enter opens the file; Ctrl+Enter opens it in a new window. Tab (or the ⇥ icon at the end of a row)
  fills in the highlighted file's path instead, to edit it or go on into its folder.

A file already open in the window gets focused, not opened twice, also when its name is typed in
another case on a disk that ignores case (macOS and Windows usually do). A path that doesn't exist opens
as a *missing* tab, which fills in by itself once the file is written.

### Which window a file goes to

Without `--profile` or `--new-window`, files open in the **last galeo window you used**, in any
profile; with `--profile NAME`, in that profile's last window, starting the profile if it isn't
running.

On GNOME Wayland an application can't tell which workspace you're on. If the last window you used
sits on another workspace, galeo adds the tabs there without moving you: GNOME shows a
"galeo is ready" notice and the taskbar entry asks for attention. Use `--new-window` (or drag
the file into the window in front of you) when you want it here.

## Watching a folder

When an agent or a build writes reports into a folder, galeo can list them as they arrive:
`galeo --watch <folder>` from a terminal, or *Watch folder…* in the palette (a folder picker). A
window watches one folder; watching another replaces it.

- A **panel on the right** lists the files created or changed there since watching started, newest
  first: *new* or *changed*, the time, and the subfolder they are in. Files that were there before
  aren't listed until they change. Only the types galeo opens count, in subfolders up to 4 levels
  deep; the folders quick open skips (`.git`, `node_modules`, the `quickOpenExclude` setting…) and
  symlinked folders are left out, and so is anything whose real path is outside the folder.
- **Click or Enter** opens a file (Ctrl+Enter or a middle click: in a new window); it is then marked
  *opened*, and a later change marks it *changed* again. **Open all new** opens every file not
  opened yet, oldest first, and asks first when there are more than 20. The list keeps the newest 200.
- The panel shares the right side with the outline: opening one closes the other. **Ctrl+Shift+D**,
  the folder button in the title bar or the status bar's "Watching reports/" toggles it; while it is
  closed, the button shows how many files aren't opened yet.
- If the folder is deleted, the panel says so and keeps its list; watching resumes once the folder is
  back. Past 1,000 subfolders, or where the system won't watch one, folders are checked every few
  seconds instead, and the panel says so.
- **Stop watching** (in the panel or the palette) ends it. Otherwise the watched folder comes back
  with its window after a restart, with the list empty.

galeo reads nothing in the folder until you open a file: the list comes from file names and times.

## Reading

- **Live reload**: a file that changes on disk updates in place and keeps your place; the tab
  shows `↻` for a moment. A tab whose file changes while you read another one shows a blue `•`
  until you show it. F5 or Ctrl+R reloads by hand.
- **What changed**: when you come back to a tab, what changed in its file since you left it is
  marked with an amber bar (blocks in rendered Markdown, lines in the source view), and the status
  bar counts the changes. While you watch a tab, the marks add up. **F7** and **Shift+F7** go to
  the next and previous change; *Clear change marks* in the palette starts again from what is
  shown. Your own edits are never marked, and nothing is kept after galeo quits.
- **Views**: Ctrl+U switches a Markdown or JSON file between rendered (or tree) and source; Alt+Z toggles wrapping;
  logs open in source view, and End follows the end of a growing log. A log line shows its level
  as a badge (ERR, WRN, INF, DBG), its timestamp muted, its level word in the level's colour and
  the keys of `key=value` pairs and JSON lines in colour; error and warning lines are tinted.
- **JSON** opens as a **tree** with its top level shown, in the source view's colours. ↑/↓ move
  between nodes, → opens a node (or steps into it), ← closes it (or steps out); a click focuses a
  node, its arrow or a double-click opens or closes it. *Expand all nodes*, *Collapse all nodes*
  and *Copy JSON path* (`$.items[3].name`) are in the palette. JSON that doesn't parse opens as
  source, with a banner saying where it breaks and the cursor there; JSON over 10 MB (or 200,000
  values, or nested over 1,000 deep) opens as source. Find (Ctrl+F) works in the source view.
- **CSV and TSV** open as a **table**: the header row stays in view, rows are numbered, and each
  cell shows its full value as a tooltip. Arrow keys move between cells, Home/End to a row's ends,
  Ctrl+Home/End to the table's (on macOS Cmd+Home/End, and Cmd+arrows to the first or last row and
  the row's ends). The separator is found from the first lines (comma, semicolon, tab
  or pipe), and the first row is taken as the header: the **Table options** in the status bar (or
  the palette's *Table separator: …* and *First row is a header*) change either for that tab, and
  it keeps them; Settings has the defaults. `.psv` files open as tables, and *Show as table* in the
  palette shows any other text file as one. Ctrl+U shows the text, and
  Ctrl+\ puts the table beside it (in edit mode the table follows your typing). Past a million
  rows the table shows the first ones and says how many there are. A file over 100 MB opens as
  source with **Show as table** (up to 256 MB); a big table may take a few seconds. Find (Ctrl+F)
  works in the source view.
- **Code and data files**: YAML, TOML and source code (TypeScript, Python, Rust, Go, shell,
  C and many more) open in the source view, highlighted, and so do JSON's source and JSON Lines
  (`.jsonl`, `.ndjson`). Ctrl+Shift+[ folds the block at the
  cursor and Ctrl+Shift+] unfolds it (on macOS Cmd+Alt+[ and Cmd+Alt+]), or use the markers in the gutter. The outline of a YAML or
  TOML file lists its top-level keys (and TOML's tables).
- **Split view** (Markdown, MDX, CSV and TSV): Ctrl+\ shows the source on the left and the rendered view on the
  right; scrolling either keeps the other on the same block. Drag the divider, or focus it and use
  the arrow keys; double-click or Home puts it back at half. Ctrl+\ again goes back to the view
  you had; Ctrl+U goes to the rendered view. A window narrower than about 700 px shows one view
  until it widens. A tab keeps its split and divider across restarts.
- **Broken links**: a link to a file that doesn't exist has a wavy red underline and says "File not
  found"; the marks are checked again whenever the document changes.
- **Tick task boxes**: click a task box (or press Space on it) to tick or untick it; galeo writes
  the file at once, keeping its encoding and line endings, and doesn't mark your tick as a change.
  If the file changed on disk meanwhile, nothing is written: tick again once it shows.
- **Task progress**: a Markdown plan with task items (`- [ ]`, `- [x]`) shows how many are done in
  the status bar ("7 of 12 tasks"), and the outline shows each heading's own count ("2/5").
- **Find** (Ctrl+F), **outline** (Ctrl+Shift+O), **zoom** per tab (Ctrl++ or Ctrl+= / Ctrl+- /
  Ctrl+0, or Ctrl and the wheel), and every command by name in the **palette** (Ctrl+Shift+P).
- **Reader width** per tab: Alt++ or Alt+= widens the reading column of Markdown and `.txt` by
  8 characters, Alt+- narrows it (40 to 200), Alt+0 puts it back to the setting; **Full width** in
  the palette uses the whole window (run it again to go back). The status bar shows a tab's width
  only while it differs from the setting, and a tab keeps it across restarts. A tab left at the
  setting follows it when the setting changes.
- **Status bar**: the path (click to copy it or reveal it in Files), the view (click for a menu of
  the views, Wrap and the outline), the encoding, the
  line count (in the source view) and, for Markdown and `.txt`, the word count and reading time. A
  log has a **Follow** button; a click on the zoom or the reader width puts it back.
  Markdown counts its prose only: code blocks, math, diagrams and front matter aren't words.
- The document's **right-click menu** has Back, Forward, Find…, Reload, Edit (or Save while editing),
  a JSON tree's Expand all, Collapse all and Copy JSON path, and the file's entries below.
- **Open with default app** (in the palette, or the right-click menu) hands the file to the app your system uses for it. It
  isn't offered for programs and launchers, and on macOS and Windows only for known document types:
  images, PDF, office documents, audio and video, and the text formats galeo reads.
- **Diagrams and math**: math is typeset with the document (KaTeX); Mermaid diagrams draw as you
  scroll towards them. A diagram that can't be drawn (a syntax error, or over 200 edges) shows its
  error and its source. A diagram too wide for the column scrolls sideways; its ⤢ button (shown
  on hover, or reached with Tab) opens it in a viewer: + and − or the wheel zoom, drag or the
  arrow keys pan, 0 fits it, 1 shows it at 100 %, Esc closes. Images open in the same viewer: click
  one, or use its ⤢ button (a linked image follows its link on click; icons don't offer it). In dark mode, a diagram that sets
  its own colours is drawn as written, on a light panel. In the viewer, **Save as SVG…** or **Save as
  PNG…** saves the diagram where you choose.
- **Copy**: a code block's copy button (at its corner, on hover or with Tab) copies its code; *Copy
  as rich text* (palette, or the document's right-click menu) copies the whole rendered document, to
  paste with its formatting into another editor (which may load the document's web images).
- **Export to PDF…** (palette, or the right-click menu) saves the rendered document as a PDF where
  you choose: the document alone, in the light theme, ready to print or send.
- **MDX articles** (`.mdx`) render like Markdown, and nothing in them runs: imports and exports
  are hidden, a component shows as a dashed box labelled with its tag and props, with its content
  inside, and `{expressions}` show as code (comment-only ones are hidden). Lowercase HTML tags work
  as in Markdown. A syntax error opens the file as source with a banner naming the line; in split
  while editing, the last good preview stays with *Preview paused*.
- **Large or slow documents**: Markdown or MDX over 5 MB, or that takes more than 2 s to render, opens as
  source with a banner; **Render anyway** renders it (and waits up to a minute). A render still
  going after 5 s offers **Cancel** under the loading lines: the source shows at once.
- **A document that crashed the window**, or an error galeo's page can't go on from: the window
  comes back with its tabs, and that tab shows a notice instead of rendering again. *Try again*
  renders it; *Open as source* shows its text. A window that crashes 3 times within a minute stops
  reloading and says so: *Try again* brings its tabs back, *Close window* closes it.

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
- **Task boxes**: in edit mode, the preview of split view (Ctrl+\) ticks them: a click (or Space)
  changes the editor's line from `[ ]` to `[x]` and back; Ctrl+S saves it, Ctrl+Z undoes it. (While
  reading, a click ticks the box in the file at once: see Reading.)
- **Tab** indents: at the cursor it adds the file's own indent (a tab, or its two or four spaces);
  with lines selected it indents them all. **Shift+Tab** takes one level off. To move the focus
  out of the editor with the keyboard, press **Esc** then **Tab**, or **Ctrl+M** (Control+M on
  macOS), which switches Tab between indenting and moving the focus. With the find bar open, the
  first Esc closes it.
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
- **A save cut short** (galeo or the computer stopped mid-write) can leave a hidden
  `.<name>.<id>.tmp` beside the file; the file itself is untouched. The next save of that file
  removes such leftovers once they are an hour old, and says so in the terminal galeo runs in.
- **If the window crashes**, unsaved text you typed more than a second before comes back in its
  tab, still unsaved. galeo keeps it in memory only: never in a file of its own.

## Tabs, windows and sessions

Tabs and windows work like a browser's: Ctrl+Tab to cycle, Ctrl+W to close, Ctrl+Shift+T to
reopen what you closed last, Ctrl+N for a new window. Ctrl+Shift+A searches the window's open tabs
and its last 25 closed ones by name or folder: Enter shows an open tab, or brings a closed one back
where it was. Ctrl+Shift+E (or ▦ at the end of the tab bar) shows the window's tabs as a grid of
cards, each with its folder, format and marks: the arrows move between them, Enter shows one, Delete
closes it, and Ctrl+Shift+PgUp/PgDn or a drag moves it. Ctrl+Shift+F finds text in all the
window's tabs, unsaved ones as they are on screen: each tab with matches lists its first ones with
their line, and Enter shows that tab with its find bar on the match. It searches the files' source
text, so a rendered page can count differently. The ⌕ and ⋯ buttons at the end of the bar open tab
search and the command palette.

Right-click a tab or its card in the overview (or press Shift+F10 on a tab) for its menu: close it,
close every other tab but the pinned ones (*Close others*; unsaved ones ask first), reopen the last
closed tab, move it to a new window or another one, copy its path, reveal it in Files, or pin it. Pinned tabs stay
first, show a pin, stay loaded (unless memory runs short), and stay pinned after a restart; *Pin or
unpin tab* in the palette does the same for the shown tab. The profile menu also opens a new window
and Settings.

A profile can put its tabs on the left instead (Settings → **Window** → Tabs: Left, or *Put tabs on the left*
in the palette): one row per tab, with its folder underneath, and the shown tab's name in the title
bar. Drag the divider to set the panel's width (140 to 480 px, kept for the profile; a double-click
resets it). ◧ in the title bar, or Ctrl+Shift+B, collapses the panel to a strip of letters that still
switches tabs, and expands it again; so does dragging the divider to the edge and back. Everything
the tab bar does works in the list: ↑/↓ between tabs, dragging to reorder, dropping files between
rows, and dragging a tab to another window or out to a new one.

Closing a profile's last window, or quitting
(Ctrl+Shift+Q, Cmd+Q on macOS), keeps its session: next time its windows and tabs come back where you left them.
"Restore previous session" (palette or profile menu) goes back to one of the last three.

To move a tab to another window, drag it onto that window's tab bar, anywhere on it, even a window
with no tabs. Drop it anywhere outside galeo's windows, on the desktop or another application, to give it a
window of its own; the window it left
keeps its other tabs. Esc with the pointer outside the window does the same, so drag the tab back if
you didn't mean to. A tab keeps its history, view, zoom, reader width, edit mode and unsaved changes
(not their undo history). Moved into another profile's window, it becomes part of that profile's
session. The window a last tab leaves closes. From the keyboard, the palette has *Move tab to new
window* and *Move tab to window…*. The Settings tab stays in its window.

## Profiles

A profile is a separate set of windows, session, recent files and settings, for example one per
client or project. The profile chip at the left of the tab bar (Ctrl+Shift+M) lists them and
creates, renames, recolours or deletes them. `galeo --profile NAME` creates a profile on first use,
with an Undo. The `default` profile can't be deleted; deleting another removes its session and
settings, never your files. On Linux, Settings → **Profile launcher** adds "galeo — <profile>" to
your applications, which opens galeo straight in that profile; renaming the profile renames it, and
deleting the profile removes it.

## Settings and custom CSS

Settings (Ctrl+,) apply to all profiles or to the current one only, as the switch at the top
says. **Measure**, the reading column's width, is Narrow (60 characters), Normal (72), Wide (100),
Full width, or Custom (40 to 200); in a settings file it is a number or `"full"`. galeo 0.2 reads a
file with `"full"` as invalid and keeps its last valid settings. The **prose and code fonts** are
pickers: the fonts galeo ships first, then the families installed on the system (monospace ones
for code, listed by fontconfig without any network), each drawn in its own face, with a sample
line under the field; any other family name can still be typed. **About galeo** (the version, the
licence and the notices of what galeo ships) is at the end of Settings, in the profile menu and in the
palette. galeo keeps its files in the usual places:

| What | Where |
|---|---|
| Settings for all profiles, and their custom CSS | `~/.config/galeo/settings.json`, `custom.css` |
| A profile's own settings and custom CSS | `~/.config/galeo/profiles/<id>/profile.json`, `custom.css` |
| Sessions and recent files | `~/.local/state/galeo/` |
| Caches | `~/.cache/galeo/` |

On macOS the config folder is `~/Library/Application Support/galeo/`, sessions are in its `State`
folder and caches in `~/Library/Caches/galeo/`; on Windows they are `%APPDATA%\galeo\`, its
`State` folder and `%LOCALAPPDATA%\galeo\Cache\`.

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
