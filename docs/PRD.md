# PRD: galeo

- **Author**: project owner
- **Date**: 2026-09-25 (updated 2026-09-26)
- **Status**: Approved (2026-09-26)
- **Target release**: v0.1 "reader", then v0.2 "editor"
- **Related**: ADR-001…ADR-008 (all Accepted), UX specification, threat model, architecture —
  see [References](#references)

## Problem

Working with coding agents produces a steady stream of Markdown: specs, execution plans,
handoffs, ADRs, reviews, research notes, drafts of articles. Some of it is committed, much of it
lives in git-ignored folders (`.local/`, `.claude/`, scratchpads), and some of it is ephemeral.
Markdown has become the exchange format between agents and humans, and it has to be *read* —
often, quickly, and while an agent is still writing it.

Today the owner opens these files as Chrome tabs through a Markdown extension. It works because
tabs are light, easy to navigate, and can be left open as reminders of work in progress, and
because separate Chrome windows on separate GNOME workspaces keep each client's or project's
files together. It falls short in four ways:

1. **Opening a file is slow.** Find it in the Files app, then drag it into Chrome. There is no
   `open this in my reader` from the terminal, where most work now happens (Claude Code CLI).
2. **It looks and reads poorly**, with little control over typography or styling.
3. **It only handles Markdown.** A `.log`, `.json` or `.yaml` means launching an IDE, which is
   overkill for reading.
4. **Writing articles** (md/mdx for an Astro site) needs a separate editor with a preview.

Existing tools were surveyed (2026-09-25); none that is well adopted and maintained combines
multiple windows with tabs, CLI + double-click opening, per-context grouping, and a reader-first
design. Obsidian is vault-bound and skips dot-folders, so it does not cover in-place reading of
scattered files; it remains the candidate for a future curated knowledge vault, which galeo
must not obstruct (plain files only, no sidecar metadata).

**Personas**
- **Owner (primary)**: solo developer on Ubuntu 26.04 GNOME (Wayland), several workspaces, one
  per client/project; lives in the terminal with coding agents; writes technical articles.
- **Agent-heavy developer (secondary, public OSS audience)**: same workflow, same pile of Markdown.

## Goals

1. Opening any supported file takes one action: `galeo <file>`, a double-click in Files, or a drag
   into a window — and it lands in the right window.
2. Reading feels like a fast browser tab: see the performance targets in Constraints.
3. Files are grouped by **profile** (client / project), each with its own windows, tabs and look,
   and every profile reopens where it was left.
4. Reading Markdown matches or beats the current extension in typography and rendering
   (code, math, diagrams, tables), with full control over theming.
5. (v0.2) Articles can be edited as raw text with a live split preview that matches the target site
   rendering closely enough to catch mistakes before publishing.

## Non-Goals

- Not a knowledge base or PKM: no vault, no backlinks graph, no index database, no tags.
- Not a WYSIWYG editor and not an IDE: raw text editing only, no plugins, no LSP, no terminal.
- No accounts, sync, telemetry, cloud features, AI features, or automatic update checks.
- The app itself makes **no network requests** (external links open in the system browser).
- Not a replacement for `astro dev`: MDX components are shown as placeholders, not executed.
- macOS/Windows are not *officially* supported in v0.1–v0.2. The code is portable by design and
  tested in CI on all three OSes; unsigned macOS/Windows **preview** builds are published.
- No sidecar files next to user documents; galeo never writes into user folders except when
  the user explicitly saves an edit (v0.2).

## Key concepts

- **Profile** — a named context, like a Chrome profile: its own set of windows and tabs (the
  session) and its own settings (theme, fonts, custom CSS), inherited from global defaults and
  overridable per profile. A `default` profile always exists.
- **Tab states** — *active* (visible), *warm* (rendered, hidden, kept for instant switching),
  *hibernated* (only a record kept: path, view mode, scroll position, file identity and
  back/forward history; re-rendered on demand).
- **Views** — every file has a **source view** (read-only by default, line numbers, wrapping);
  some formats also have a **rendered view** (Markdown now; JSON/CSV/etc. later). v0.2 adds
  **edit mode** and **split view** (source + rendered side by side).

## User Stories — v0.1 "reader"

### Must Have

1. **Open from the terminal.** As the owner, I want `galeo [--profile <name>] [--new-window] <file…>`
   so that I can open what an agent just wrote without leaving the terminal.
   - AC: Given galeo is not running, when I run `galeo plan.md`, then a window opens showing the
     rendered file.
   - AC: Given galeo is running, when I run `galeo a.md b.log`, then both open as new tabs in the
     target window of the running instance (no second instance) and the command returns at once.
   - AC: Given `--profile acme`, the files open in a window of profile `acme`, starting that
     profile (and restoring its session) if it is not running.
   - AC: Relative paths resolve against the shell's working directory.
2. **Open from the Files app.** As the owner, I want double-click / "Open With galeo" on
   `.md`, `.markdown`, `.txt`, `.log` so that indexed search in Files is a way into galeo.
   - AC: After installing the package, galeo appears as an application for those types and can
     be set as the default; double-clicking a file follows the routing rule below.
3. **Routing rule when no profile is given.** As the owner, I want files to land in the profile I
   was last working in.
   - AC: The target is the last-focused galeo window (new tab there). If no galeo window
     exists, a new window opens in the last-used profile; if none, the `default` profile.
   - AC: `--new-window` always opens a new window in the target profile.
   - AC: The target window is not force-raised: if it is on another GNOME workspace, the tab is
     added there and GNOME shows its "ready" notice (ADR-005). `--profile` / `--new-window` put
     the file where the user is.
4. **Drag and drop from Files.** As the owner, I want to drag one or more files from Files onto a
   galeo window so that they open there.
   - AC: Dropping onto the document area opens the files as new tabs after the active tab.
   - AC: Dropping onto the tab bar inserts the tabs at the drop position.
   - AC: Unsupported/binary files show a clear "can't display" tab state instead of failing.
5. **Rendered Markdown.** As a reader, I want excellent rendering so that long agent documents
   are pleasant to read.
   - AC: CommonMark + GFM (tables, task lists, strikethrough, autolinks, footnotes), heading
     anchors, syntax-highlighted code blocks with a copy button, KaTeX math (`$…$`, `$$…$$`),
     Mermaid diagrams, YAML frontmatter shown as a collapsible, highlighted YAML block.
   - AC: Relative images render from disk; relative links to supported files navigate in the same tab with
     back/forward history (Ctrl+click opens a new tab);
     `#anchors` scroll; `http(s)` links open in the system browser.
   - AC: Raw HTML inside Markdown is sanitized (no scripts, no remote loads).
6. **Source view.** As a reader, I want to toggle a read-only source view (line numbers, wrap
   toggle, syntax highlighting) for any file.
   - AC: A keyboard shortcut toggles rendered ⇄ source for Markdown; `.txt`/`.log` open in their
     own views directly.
7. **Text and log files.** As the owner, I want `.txt` in a typography-focused reader view and
   `.log` in a monospace view with level highlighting (ERROR/WARN/INFO/DEBUG) and a "follow end"
   toggle so that I can watch agent or service logs.
8. **Tabs and windows.** As the owner, I want multiple windows per profile, each with tabs, so
   that I can keep work-in-progress documents open as reminders.
   - AC: Open, close, reorder by drag, switch (Ctrl+Tab, Ctrl+1…9), reopen closed tab
     (Ctrl+Shift+T); tab tooltip shows the full path; duplicate paths are disambiguated.
   - AC: Inactive tabs move to warm, then hibernated, per the lifecycle; switching back restores
     the scroll position.
9. **Profiles.** As the owner, I want to create, rename, delete and switch profiles, each with its
   own theme/fonts/CSS, so that each client's context is separate and recognisable.
   - AC: `galeo --profile <name>` matches a profile id, then a name (case-insensitive). An unknown
     name creates the profile with a "Created profile '<name>' · Undo" toast. The window title
     and tab bar show the profile name and accent colour.
10. **Session restore.** As the owner, I want a profile to reopen exactly where I left it.
    - AC: Launching a profile restores all its windows and tabs as hibernated tabs with scroll
      positions; the active tab of each window renders first.
    - AC: Tabs whose file no longer exists show a "file missing" state with the path, and recover
      automatically if the file reappears.
    - AC: The last 3 sessions are kept; "Restore previous session" brings one back.
11. **Live reload.** As the owner, I want open files to update when an agent rewrites them.
    - AC: Given a visible file changes on disk, the view updates within 500 ms without losing the
      scroll position (anchored to the nearest heading/line). Hibernated tabs refresh on wake.
    - AC: Rename/delete while open → "file missing" state, never a crash.
12. **Search within file.** Ctrl+F finds text in the rendered and source views, with match count
    and next/previous.
13. **Quick open (Ctrl+P).** As the owner, I want to fuzzy-find files in the repository of the
    active file (git root, else its folder) and among open tabs.
    - AC: Includes git-ignored files and dot-folders such as `.local/` and `.claude/`; excludes
      `.git/`, `node_modules/` and common build folders, plus names the user adds in settings. No
      index is persisted.
14. **Themes and typography.** As a reader, I want light/dark/follow-system themes, font family
    and size, line width, and a custom CSS file per profile or global.
    - AC: Bundled themes meet WCAG AA contrast; Ctrl+= / Ctrl+- / Ctrl+0 zoom per tab.
15. **Zero network, enforced.** As the owner, I want a guarantee that no document or feature makes
    network requests, so that private client documents never leak.
    - AC: An automated test opens documents with remote images, iframes, scripts and fonts and
      asserts zero outbound connections (socket-level on Linux; in-app guard counters on the
      macOS/Windows previews); remote images show a placeholder with the host name and a
      Copy URL action.

16. **Copy path and Reveal in Files** on a tab and in the status bar.
17. **Recent files** (per profile) in quick open and the empty window.

### Should Have

- Outline / table-of-contents sidebar for the active Markdown document (first to drop if the
  schedule slips).
- Drag a tab to another window; drag a tab out to create a new window (**deferred to v0.1.x**).

### Could Have

- Print / export to PDF (offline, via the engine's print-to-PDF).
- Obsidian-flavoured syntax: `[[wikilinks]]`, `> [!note]` callouts.
- Per-profile GNOME launcher entries ("galeo — acme").

### Won't Have (v0.1)

- Editing (v0.2); JSON/YAML/TOML/CSV/source-code rich views (v0.3); Graphviz, D2, PlantUML
  (v0.4); anything in Non-Goals.

## User Stories — v0.2 "editor"

### Must Have

1. **Edit mode.** As a writer, I want to switch any text file from read-only to edit mode with a
   shortcut, so that small fixes don't need another editor.
   - AC: Read-only is the default for every tab; edit mode is explicit and visible (indicator in
     tab and status bar). Ctrl+S saves atomically (write temp, rename). Unsaved changes are marked
     and guarded on close/quit.
   - AC: Given the file changes on disk while I have unsaved edits, then I'm offered
     "keep mine / load theirs / show diff" — never a silent overwrite.
2. **Split view.** As a writer, I want source and rendered side by side with synchronised
   scrolling, so that I can review an article while editing.
   - AC: The preview updates as I type (debounced, no visible lag on a 5,000-word article);
     scrolling either pane keeps the other aligned at block level.
3. **MDX articles.** As a writer, I want `.mdx` files to render their Markdown content, with
   imports hidden and JSX components shown as labelled placeholders, so that the article text
   can be reviewed faithfully.
4. **Astro/MDX-compatible rendering.** Code highlighting uses the site's Shiki themes
   (`github-light` / `github-dark`), math uses remark-math + KaTeX, so the preview matches the
   published article closely.

### Should Have

- Editor basics: find/replace, multiple cursors, soft wrap, Markdown-aware highlighting.
- Optional Vim keybindings.

### Won't Have (v0.2)

- WYSIWYG, toolbars, running Astro components, publishing from galeo.

## User Experience

A browser-like window: a tab bar with the profile name/colour at the left, the document below,
and a slim status bar (path, view mode, read-only/edit state, encoding, line count). No sidebar
by default; the outline is a toggle. Everything is keyboard-reachable; the core map is
Ctrl+P (quick open), Ctrl+F (find), Ctrl+U (toggle source), Ctrl+E (edit mode, v0.2),
Ctrl+\\ (split view, v0.2), Ctrl+Tab / Ctrl+Shift+Tab, Ctrl+W, Ctrl+Shift+T, Ctrl+N (new window).
Detailed flows, states (empty, loading, missing, binary, too large) and the full keyboard map
live in the [UX specification](design/ux.md).

## Constraints

- **Performance** (measured on the owner's machine with an automated harness; release-blocking):

  | Metric | Target |
  |---|---|
  | Cold start → first document painted | < 500 ms |
  | Open new tab (≈50 KB Markdown, no diagrams) → first paint | < 100 ms |
  | Switch to a warm tab | next frame, no visible re-render |
  | Wake a hibernated tab → painted at saved scroll position | < 150 ms |
  | Live reload after file change → updated view | < 500 ms |
  | Scrolling a long document with Mermaid diagrams | no dropped-frame jank at 60 Hz |
  | Memory, 3 profiles / ~20 tabs / ≤3 warm per window | baseline recorded in v0.1, must not regress |

- **Large and odd files**: Markdown above a size threshold (initially 5 MB) opens in source view
  with a banner; logs of 100 MB+ open in source view without freezing the UI; binary files
  (NUL bytes / invalid text encoding) show a "can't display" state. Encoding: UTF-8, then byte
  order marks (UTF-16/32), then a Windows-1252 fallback with a banner and "Reopen with encoding…".
- **Platform**: official: Ubuntu 26.04 LTS, GNOME, Wayland (primary) and X11; x86_64. Package: `.deb`
  (official; installs the AppArmor profile Chromium's sandbox needs on Ubuntu 24.04+), `galeo` on `PATH`,
  `.desktop` file with MIME associations. AppImage as a secondary portable build for
  distributions without user-namespace restrictions (on Ubuntu 24.04+ it runs only if the user opts in to unsandboxed mode, with a warning). Previews
  (unsigned, unsupported): macOS `.dmg`/`.zip` (x64, arm64), Windows NSIS installer. No npm
  package in v0.1 (it could not offer desktop integration or the hardened binary).
- **Accessibility**: full keyboard operation; visible focus; ARIA roles for tabs; bundled themes
  WCAG 2.2 AA contrast; honours reduced-motion.
- **Privacy/security**: zero network (enforced and tested); no telemetry; rendered content is
  sandboxed and sanitized; the app reads only files the user opens or the quick-open folder.
- **Portability**: plain files only; no sidecar metadata; settings and sessions in the OS's
  standard app directories (XDG on Linux: `~/.config/galeo`, `~/.local/state/galeo`);
  shortcuts map Ctrl→Cmd on macOS.
- **Licence**: MIT; dependencies must be MIT-compatible.

## Success Metrics

| Metric | Current | Target | How measured |
|---|---|---|---|
| galeo is the default app for `.md` on the owner's machine | Chrome extension | Default after v0.1 | `xdg-mime query default text/markdown` |
| Actions to open a file from the terminal | ~3 (Files, find, drag) | 1 (`galeo <file>`) | Manual check |
| Performance targets met | n/a | All green | Perf harness in CI / release checklist |
| Outbound network requests | n/a | 0 | Automated no-network test |
| Security requirements SR-01…SR-17 (v0.1-applicable) | n/a | Audit passes | Pre-release security audit |
| (v0.2) Articles edited in galeo before publishing | 0 | Next article | Owner's use |

## Open Questions

- [x] **GNOME Wayland workspace awareness.** Decided in ADR-005: accepted limitation; route to the
      last-focused window without stealing focus.
- [x] **Flatpak.** Deferred (ADR-008): its sandbox conflicts with "open any file" and the `galeo` CLI.
- [x] **Custom CSS contract.** `--galeo-*` variables and a few `galeo-*` classes (ADR-006), listed in
      [document-styling.md](design/document-styling.md); the global and profile `custom.css` are
      adopted into every document's shadow root, live (confirmed with profiles, 2026-09-29).
- [x] **Quick-open exclusions**: a built-in list of folder and file names (version control,
      dependencies, build output), skipped wherever they appear, plus names from the
      `quickOpenExclude` setting; no ignore file and no globs in v0.1 (owner, 2026-09-29).
- [x] **Log level patterns**: a fixed set in v0.1 (level words, `key=value` and JSON level fields, one-letter tags, syslog priorities), decided with the log view (2026-09-27). User-configurable patterns can come later.
- [ ] **Obsidian syntax** priority (Could → Should?): GitHub-style alerts / callouts are noted on
      the ADR-003 roadmap; decide after v0.1.

## References

- [ADR-001 — App shell stack: Electron](decisions/ADR-001-app-shell-stack.md)
- [ADR-002 — Window & tab model](decisions/ADR-002-window-and-tab-model.md) ·
  [ADR-003 — Rendering pipeline & format registry](decisions/ADR-003-rendering-pipeline-and-format-registry.md) ·
  [ADR-004 — Security & zero network](decisions/ADR-004-security-and-zero-network.md) ·
  [ADR-005 — Profiles & sessions](decisions/ADR-005-profiles-and-session-persistence.md) ·
  [ADR-006 — Renderer UI framework](decisions/ADR-006-renderer-ui-framework.md) ·
  [ADR-007 — Platform seam](decisions/ADR-007-platform-seam.md) ·
  [ADR-008 — Packaging & distribution](decisions/ADR-008-packaging-and-distribution.md) ·
  [Architecture](ARCHITECTURE.md) · [Dependencies](dependencies.md)
- [UX specification](design/ux.md) · [Threat model](security/threat-model.md) (security
  requirements SR-01…SR-17 are part of this PRD's constraints)
- The target site's rendering setup (Astro MDX, Shiki `github-light`/`github-dark`, remark-math + KaTeX)
