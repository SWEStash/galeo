# ADR-028 — "Open with default app" on macOS and Windows: known document types only

- Status: Accepted (2026-11-03, owner)
- Date: 2026-11-03
- Deciders: project owner
- Supersedes: in [ADR-004](ADR-004-security-and-zero-network.md), the "Open with default app" row's rule
  ("not executable and not a launcher type") on macOS and Windows. On Linux that rule stands.
- Related: [Threat model](../security/threat-model.md) SR-05, [ADR-027](ADR-027-macos-windows-previews.md)
  (the previews), [v0.5 audit](../security/audits/2026-11-02-v0.5.md) L2

## Context

"Open with default app" hands a file to the desktop (`shell.openPath`), and the desktop runs whatever program is
registered for its type. SR-05 says galeo never hands over a file that runs something. Today one rule decides on
every system: the file is a regular file, it has no executable bit, and neither its name nor, through a symlink,
its target has a type on a list of launchers (`src/core/links/open-with.ts`). Both callers use it: the document's
own menu and the Settings tab's "Open CSS" and "Open file" (`openConfigFile`).

On Linux the executable bit does most of the work, and the list covers what runs without it (`.desktop`,
AppImages, packages, Flatpak refs). On Windows there is no executable bit, so the list is the only guard. On
macOS the bit exists, but apps, installers, scripts and profiles run without it. The v0.5 audit's L2 found more
than twenty types the list missed: HTML Help that runs script, ClickOnce and MSIX installers, disk images Windows
mounts, `.rdp`, theme and search files that reach a remote share; `.fileloc`, `.inetloc` and `.mobileconfig`
on macOS. They were added (`d18dc41`), but the list fails open. Any program can register a new type, so the
next type nobody listed is offered.

## Options

1. **Keep the list, and keep it current.** No behaviour change. It fails open on each type nobody listed, and
   the audit shows how many there are. Keeping it current means following every new Windows and macOS handler.
2. **On macOS and Windows, offer it only for known document types. Linux keeps today's rule.** It fails closed
   where no executable bit backs the list. A type off the list loses the item, but "Reveal in Files" stays, and
   the user can open the file from Finder or Explorer. Linux's behaviour is unchanged (v0.5's AC6), and so is
   the rule the 0.1–0.4 audits checked.
3. **Known document types on every system.** One rule. It changes Linux, the official platform, where the
   executable bit and the list have held since 0.1. Linux users would lose the item for any type off the list.

## Decision

Option 2.

- On `darwin` and `win32`, "Open with default app" is offered only when:
  - the file passes today's checks (a regular file, no executable bit, not a launcher type);
  - **and** both its name and its symlink target have a type on an allowlist of known document types.
- The allowlist holds documents whose usual default app shows them and runs nothing:
  - images: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.tif`, `.tiff`, `.heic`, `.heif`, `.avif`, `.ico`;
  - `.pdf`;
  - office documents that carry no macros: `.docx`, `.xlsx`, `.pptx`, `.odt`, `.ods`, `.odp`. Legacy `.doc`,
    `.xls` and `.ppt`, and the macro-enabled `.docm` and `.xlsm`, can carry macros. A clone has no
    downloaded-file mark, so Office wouldn't open them in Protected View;
  - audio and video: `.mp3`, `.m4a`, `.aac`, `.wav`, `.flac`, `.ogg`, `.opus`, `.mp4`, `.m4v`, `.mov`, `.mkv`,
    `.webm`, `.avi`;
  - the text and data formats galeo reads, which the user may want in an editor: `.md`, `.markdown`, `.mdx`,
    `.txt`, `.log`, `.json`, `.yaml`, `.yml`, `.toml`, `.csv`, `.tsv`. Also `.css`, so Settings' "Open CSS"
    keeps working, and `.json` covers its "Open file" for the settings files.
- Not on it:
  - `.html`, `.htm`, `.svg` and `.xml`: a browser runs a local file's script;
  - archives: their default app is a folder view, one step from running what's inside;
  - source code: on Windows `.js` and `.py` run when opened.
- The rule lives in `canOpenWithDefaultApp`, which now takes the platform, as path identity does (core stays
  free of Node). Linux behaves as before. The simulated-platform unit tests cover each system.
- On Windows and macOS the menu keeps the item, disabled, for other types, as it is today for a launcher.

## Consequences

- **Good:** on the two systems without an executable bit to back it, an unknown type is refused, not offered.
  The launcher list stays as a second check, and it still guards Linux.
- **Accepted:** some harmless types (`.zip`, `.epub`, `.sketch`, `.html`…) lose "Open with default app" on macOS
  and Windows. "Reveal in Files" is the way to open them.
- **Docs:** SR-05 says which rule applies where, and the UX spec's "Can't display" row what the item is offered for.
- **Reversible:** code and tests only, no stored data. Adding a type is one line and a test.

## Revisit when

- Users ask for a type: add it once its usual default app is known to run nothing.
- macOS or Windows become official, or Linux gains a launcher type the executable bit doesn't cover often
  enough that option 3 is simpler.
