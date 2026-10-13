# ADR-016 — The app is named galeo

- Status: Accepted (2026-10-13, owner)
- Date: 2026-10-13
- Deciders: project owner
- Changes: the app's name, command and identifiers everywhere they appear, including the text of
  earlier ADRs. Every earlier decision stands as it was; only the names in it change.

## Context

The app's working name read like a hex or binary viewer, and since 0.2 the app edits as
well as reads. It is also about to go public, after which a rename costs every reader and every
link.

The criteria for a new name, agreed before any candidate was scored, each counting the same:

1. It says "reading documents", not bytes.
2. It doesn't clash with a Linux desktop app, a Debian or Flathub package, or a developer tool in
   this space.
3. It gives a short command that is easy to say.
4. `SWEStash/<name>` is free.
5. It still fits once the app shows other formats than Markdown.

## Decision

1. **The name is galeo**, written in lowercase everywhere, the window title and desktop entry
   included. It echoes a printer's galley, the proof a reader reads and then corrects.
2. **Identity**: the application id is `io.github.swestash.galeo`; the package, the desktop entry
   (`galeo.desktop`) and the icon are named `galeo`.
3. **Commands**: on Linux the `.deb` installs `/usr/bin/galeo`, the ADR-009 wrapper, and
   `/usr/bin/gal`, the command-line launcher (SR-13). The Electron binary is `galeo-bin`. The
   AppImage's *Install command-line launcher* writes `galeo` to `~/.local/bin`.
4. **Folders**: the config, state and cache folders are named `galeo`. Settings, profiles and
   sessions under the old name are **not** carried over: there is no migration code, and the only
   readers of earlier builds are the owner and early testers.
5. **Internal identifiers** use `galeo` too: the app protocol `galeo:`, the CSS classes and custom
   properties (`galeo-*`, `--galeo-*`), the environment variables (`GALEO_*`), the
   `window.galeo` bridge and the launcher's internal flags (`--galeo-sandbox-unavailable`).
6. **Records**: the docs and earlier ADRs are updated to the new names in place. Their decisions
   don't change.

## Options considered

Each scored 0–2 on the five criteria above.

| Option | Score | For | Against |
|---|---|---|---|
| **galeo (chosen)** | 9 | No app or package in this space uses it; the npm and crates names are free; `gal` is free on Ubuntu | Only faintly says "page" |
| pagina | 9 | Says "page" plainly | Two small Markdown/EPUB packages share the name; plain to Spanish and Italian readers |
| quire | 8 | A real bookbinding word | A Markdown publishing tool and a project-management app share it |
| folio, galley, margo | 7–8 | Real words about pages and proofs | Each is already a Markdown app on Linux or macOS |
| Keep the working name | 6 | No work | The reasons above |

No formal trademark search was made. The owner accepted that risk.

## Consequences

### Positive

- The name says what the app is for, and it fits formats beyond Markdown.
- The command names follow the app's name.

### Negative

- Anyone who ran an earlier build starts with default settings and an empty session.
- A `.deb` under the working name installs side by side with this one; remove it by hand.

## Revisit triggers

- A trademark claim, or a project in this space with the same name.
