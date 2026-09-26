# ADR-004 — Security posture: layered content isolation, verified capabilities, enforced zero network

- Status: Accepted (2026-09-25, with review amendments)
- Date: 2026-09-25
- Deciders: project owner
- Related: [Threat model](../security/threat-model.md) (SR-01…SR-17), [ADR-002](ADR-002-window-and-tab-model.md),
  [ADR-003](ADR-003-rendering-pipeline-and-format-registry.md), [ADR-007](ADR-007-platform-seam.md),
  [ADR-008](ADR-008-packaging-and-distribution.md)

## Context

galeo's job is to render untrusted files on a machine full of secrets. The threat model's
top risks are:
- script execution from content (T1);
- handing attacker-chosen URLs or files to the OS (T2);
- network exfiltration and tracking (T3);
- engine exploits (T4);
- a compromised renderer abusing the main process (T6).

"Zero network" is a product promise, so it must be enforced and tested, not assumed.

A single control fails eventually: a sanitizer bypass, a library bug, a Chromium CVE. The design
has to assume **the renderer may be compromised** and still protect files and the network.

## Decision

Five layers. Each holds even if the one before it fails.

1. **Inert content.** Allowlist sanitizing of author HTML, a strict CSP with no inline scripts and
   no `eval`, and Mermaid/KaTeX in strict modes (SR-02, SR-03). **Trusted Types**: the Document
   Host inserts HTML only through one policy (`galeo-document`); development builds run Trusted Types
   in report-only mode to surface library violations (React, CodeMirror, Mermaid); release builds
   enforce it from v0.1, and any library exception needed is recorded in this ADR. Documents render inside a **Shadow DOM container**, so content styles and ids
   cannot reach app UI (T12).
2. **Hardened renderer.** `contextIsolation`, `sandbox`, no Node, all navigation and popups
   denied, every permission denied except `clipboard-sanitized-write` (copy buttons: write only,
   never read) (SR-01). DevTools are off in release builds, and Electron Fuses
   are set (SR-08).
3. **Verified capabilities in main.** The renderer never holds a capability; it *requests*
   actions, and main checks each request against facts it already knows. A compromised renderer
   cannot claim more than the user did:

   | Request | Main allows it only if |
   |---|---|
   | Read a file | The path came from: a CLI/second-instance or OS open event (observed by main); session restore; a quick-open selection **that is in the result list main last sent to that window**; a drop grant (below); **or** a link target that main finds in the source of the tab's document, which main itself read |
   | Drop grant (drag-and-drop) | Created only by a listener in the **preload's isolated world** that checks `event.isTrusted` and derives paths from the real `File` objects (`webUtils.getPathForFile`). Page script cannot forge it. *Accepted residual risk:* a full renderer-process compromise could forge a drop; the effect is a local file displayed inside galeo, with exfiltration still blocked by layers 3–4 |
   | Resolve a local image (`galeo://file/…`) | The image `src` appears in the image set of the tab's document as read by main; the target is a regular image file under the size cap. Main returns an opaque id, never a raw path |
   | Open external URL | The scheme is `http`/`https`/`mailto` (SR-04) **and** the URL appears literally in the tab's document link set, **and** the rate limit holds (1 per second per window; confirmation if one document triggers more than 3 within 10 s). This prevents turning the system browser into an exfiltration or spam channel |
   | Open with default app | The file is not executable and not a launcher type (SR-05), **and** the user chose it in a native context menu built by main |
   | Enable edit mode (v0.2) | Triggered by a key seen in main's `before-input-event` hook (Ctrl+E; real input, before the page sees it) or by a native menu item, never by a renderer message |
   | Write a file (v0.2) | The path is edit-enabled by main **and** passes the save-conflict check (SR-12, SR-15) |

   All IPC goes through a small typed preload API with schema validation and sender checks
   (SR-11): messages are accepted only from the **main frame** of a galeo window whose origin
   is `galeo://app` (there are no subframes). There is no generic channel.

   **Link and image extraction** for these checks runs in a **Node worker thread inside main**,
   lazily (on the first privileged request for a document), with the same size limits as
   rendering and a time budget enforced by terminating and respawning the worker. Hostile
   Markdown can therefore never stall the main process, which serves every window.
4. **Zero network in main.** The app session cancels every request that isn't to the internal
   `galeo:` protocol or `data:` (via `onBeforeRequest`, which also covers WebSocket). The spell-check
   dictionary download is off, WebRTC is restricted, prefetch is off, and there are no service
   workers, updater or crash upload (SR-06).
   - `galeo://app/…` serves bundled assets.
   - `galeo://file/<opaque id>` serves **only images** that main resolved for an open document (by
     MIME type, size-capped); the id maps to a path only inside main.
   - The CSP allows the app's own worker (`worker-src 'self'`) and nothing needs
     `'wasm-unsafe-eval'` (Shiki runs its JavaScript regex engine, ADR-003).
   - Document text never travels over the protocol, only over validated IPC.
   - No OS-level URL scheme is registered.
5. **Proof in CI.** A payload corpus, including remote resources of every kind, runs under a
   harness that records the app's socket `connect()` calls, and the build fails on any
   AF_INET/AF_INET6 connection (SR-07). Fuse states are verified on the packaged binary (SR-08).
   Electron security releases ship within 7 days (SR-09).

## Options considered

### Option 1: Layered isolation with capabilities verified by main (chosen)
**Pros**: survives a sanitizer bypass or a renderer compromise without file theft, arbitrary
writes or network leaks; each layer can be tested on its own.
**Cons**: more design work (link sets parsed in main, accelerators owned by main); some UX
commands that grant capabilities must go through native accelerators or menus.
**Complexity**: Medium · **Reversibility**: Moderate

### Option 2: Trust the sanitizer and CSP; thin IPC checks
**Pros**: simplest.
**Cons**: one bypass or engine bug means arbitrary file read, and exfiltration through
`openExternal`. That is unacceptable given the assets.
**Complexity**: Low · **Reversibility**: Easy

### Option 3: Render each document in a sandboxed iframe (`sandbox` without `allow-scripts`)
**Pros**: strong isolation even if the sanitizer fails, because no script runs in the frame.
**Cons**: one frame per rendered tab; find, copy buttons, scroll anchors and Mermaid rendering
all have to reach across the frame boundary; more complex lifecycle. Layers 1–4 already cover
the threat.
**Complexity**: Medium–High · **Reversibility**: Moderate
**Status**: fallback, adopted if a sanitizer or CSP bypass is ever found in practice.

## Consequences

### Positive
- Opening a hostile file is survivable by design, not just by sanitizer quality.
- The zero-network promise is testable, and tested on every commit.
- The security requirements map one-to-one onto tests, which gives the pre-release audit a
  ready checklist.

### Negative
- Main needs a lightweight Markdown link and image extractor (the same micromark family as
  ADR-003), run in a worker thread, to verify link-driven reads, image resolution and external
  opens.
- Commands that grant capabilities (edit mode, open with default app) can be *shown* in the
  command palette, but run through `before-input-event` keys or native menus built by main.
- A renderer-process compromise can still forge drop grants (accepted residual risk, above).
- Remote images never display. That is intended; UX shows a placeholder.

### Risks
- **Link-set verification misses edge cases** (reference-style links, autolinks, raw HTML
  anchors). Mitigation: extract links from the same parse used for rendering, and fuzz-compare
  the renderer's link set with main's.
- **Library Trusted Types violations** block enforcement. Mitigation: report-only in development
  from the first hardened window; exceptions are recorded here, never silently disabled.
- **Electron network paths not covered by `webRequest`.** Mitigation: the socket-level CI harness
  (layer 5) catches what the in-process filter misses.

## Revisit triggers
- Any sanitizer, CSP or Trusted Types bypass: adopt Option 3.
- A feature that needs the network (update check, remote images on opt-in): new ADR, plus
  a threat model update.
- New entry points (plugins, OS URL scheme, agent integration): threat model and this ADR.
