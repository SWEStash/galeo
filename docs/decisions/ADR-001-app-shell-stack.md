# ADR-001 — App shell stack: Electron

- Status: Accepted
- Date: 2026-09-25
- Deciders: project owner

## Context

galeo is a desktop reader for local text files — Markdown first (agent specs, handoffs, ADRs,
plans, articles), then `.txt`/`.log`, later `.json`/`.yaml`/`.toml`/`.csv`/source code — with a
read-only-by-default raw-text editor and a split source/preview mode for writing articles.

The primary platform is Ubuntu 24.04 GNOME on Wayland. macOS/Windows are possible later but are not
a v1 goal. The owner is a solo maintainer fluent in TypeScript and Python; no Rust toolchain is in
use today.

Forces that shape the shell choice:

- **"Lightweight" means fast and smooth, not a small binary.** Launch as fast as a Chrome window,
  open tabs quickly, scroll and switch tabs without jank. Resource use is controlled by lazy tab
  loading and unloading inactive tabs, not by install size.
- **Rendering is web tech regardless of shell.** The pipeline (remark/rehype, Shiki, KaTeX,
  Mermaid, CodeMirror 6) is a TypeScript bundle, and preview fidelity for articles depends on
  matching the same JS ecosystem the blog uses. So the choice is really *which web engine runs on
  Linux* and *which host language owns the native side*.
- **Desktop integration is required:** multiple windows each with tabs, a single-instance app that
  receives CLI args (`galeo --profile <name> <file>`) and routes them to the right window, file
  association / double-click from GNOME Files, drag-and-drop of files from Files into a window
  (with drop position), file watching for live reload.
- **Zero network access** is a product promise.

Evidence gathered on 2026-09-25 (sources below):

- On Linux, Tauri 2, Wails and Electrobun's default mode all render with system **WebKitGTK**.
  Tauri maintainers describe WebKitGTK as their weakest platform ("can't 100% recommend tauri
  (for Linux)"); open issues report Ubuntu scroll lag, broken wheel scrolling on Wayland, and
  NVIDIA/Wayland blank windows (`WEBKIT_DISABLE_DMABUF_RENDERER` is the recurring workaround).
  One reported port measured 40 fps on WebKitGTK vs 240 fps on Electron on the same GPU.
- Tauri's Chromium (CEF) runtime exists only in the v3 alpha line (first alpha 2026-09-13), with
  Linux file drag-and-drop still broken (tauri#16131).
- Electron v44 (Chromium 152, Node 24) runs natively on Wayland by default since v38, and exposes
  single-instance with argv/cwd, file drag-in, and multi-window entirely from TypeScript.

## Decision

We will build galeo on **Electron**, with all host and UI code in TypeScript, and isolate every
platform-specific capability behind a galeo-owned TypeScript interface so the shell can be
replaced later without touching the renderer.

## Options Considered

### Option 1: Electron (chosen)
Bundled Chromium; main process and renderer in TypeScript.

**Pros**: Same engine as Chrome on every OS — smoothest rendering on Linux and one rendering target
to test; native Wayland by default; complete single-instance/argv, multi-window and drag-in APIs;
most mature ecosystem; no second language or toolchain.
**Cons**: Largest install and highest baseline memory (one rough CI benchmark: ~295 MB install,
several hundred MB RSS for an empty app — treat as indicative only); security hardening is the
app's responsibility.
**Complexity**: Low–Medium
**Reversibility**: Moderate (mitigated by the platform interface — see Consequences)

### Option 2: Tauri 2 (system webview)
Rust host with WebKitGTK on Linux; UI in TypeScript; official plugins for fs/watch, cli,
window-state, drag-drop.

**Pros**: Small install and lower idle memory; strong plugin set; large community.
**Cons**: WebKitGTK on Linux is its documented weak spot, directly against the smoothness
requirement; requires the Rust toolchain and ~50–150 lines of Rust glue (the single-instance
callback is Rust-only); three different engines across OSes.
**Complexity**: Medium
**Reversibility**: Moderate

### Option 3: Tauri 3 with the CEF (Chromium) runtime
Tauri's API with bundled Chromium instead of WebKitGTK.

**Pros**: Would combine Tauri's API and small Rust surface with Chromium rendering.
**Cons**: Alpha only; Linux drag-and-drop broken; early users report instability. Still requires
Rust.
**Complexity**: Medium
**Reversibility**: Moderate

### Option 4: GTK4 + libadwaita + WebKitGTK 6 + GtkSourceView (Rust or Python)
Native GNOME app with a web view for rendering and a native source editor.

**Pros**: Best GNOME integration — single instance, file opening, native tabs with cross-window
drag and tear-off, native source editor with search and read-only mode.
**Cons**: Same WebKitGTK engine (same smoothness risk); permanently Linux-only (WebKitGTK does not
ship on macOS/Windows); two theming systems (GtkSourceView schemes + CSS); gtk-rs learning curve,
or no single binary with Python.
**Complexity**: High
**Reversibility**: Difficult

### Option 5: Other shells (Electrobun, Wails, Deno desktop, Neutralinojs, pywebview, Qt WebEngine)
**Electrobun** (TS, optional CEF): single-instance not implemented and Linux launcher drops argv —
blocks `galeo <file>`. **Wails** (Go): WebKitGTK on Linux; v3 still beta. **Deno desktop**: ~3 months
old, single-instance and file drop undocumented. **Neutralinojs / pywebview**: too limited for
multi-window routing. **Qt WebEngine (PySide6)**: Chromium and mature, but heavier to build with and
brings a second UI toolkit alongside the web UI.

## Decision Rationale

The owner's definition of lightweight — Chrome-like launch, fast tab opening, smooth scrolling —
makes the rendering engine the dominant factor. On Linux, the primary platform, Chromium is
measurably and anecdotally smoother than WebKitGTK, and every WebKitGTK-based option (Tauri 2,
Wails, GTK4 native) inherits the same documented problems. Electron is the only mature option that
ships Chromium today, and it keeps the whole codebase in the owner's strongest language, which also
maximizes coding-agent effectiveness.

We accept higher install size and baseline memory. Memory is controlled by design (below) rather
than by the shell, and the owner already accepts Chromium's footprint in daily use.

## Consequences

### Positive
- One engine everywhere: what renders on Linux renders identically on macOS/Windows later.
- Single language (TypeScript) for host, UI and renderer; one build toolchain.
- Native Wayland, single-instance argv routing and file drag-in without custom native code.

### Negative
- Larger install and higher baseline RAM than a system-webview shell.
- Chromium/Electron upgrades are ours to track (security releases follow Chromium's cadence).
- Tabs, tab drag between windows and tear-off are custom UI work (true for every web shell).

### Risks
- **Memory growth with many windows/tabs.** Mitigation: one renderer process per window with tabs
  as in-page views (not a `WebContentsView` per tab); tab states active / warm / hibernated, where
  hibernated keeps only path, scroll position and mtime; heavy libraries (Mermaid, Shiki grammars,
  KaTeX, CodeMirror) load only when a document needs them.
- **Security of rendering local and agent-written content.** Mitigation: context isolation,
  sandboxed renderers, sanitized HTML in Markdown, strict CSP.
- **Zero-network promise drifting.** Mitigation: enforce it — block all `http(s)` requests at the
  session level, serve files and app assets through a custom `galeo://` protocol, and test that no
  outbound request is possible.
- **Lock-in to Electron APIs.** Mitigation: file I/O, file watching, single-instance/argv, window
  management and session persistence sit behind one galeo platform interface; the renderer
  bundle never imports Electron directly.

## Revisit Triggers

Revisit this decision if any of these conditions arise:
- Tauri v3 with the CEF runtime reaches stable and Linux drag-and-drop works (tauri#16131 closed).
- Measured memory under realistic use (≈3 profiles, ≈20 tabs, few warm) is unacceptable even with
  tab hibernation.
- WebKitGTK closes the Linux performance gap to Chromium (evidence from Tauri/Wails issue trackers).
- macOS/Windows becomes the primary audience and install size becomes a distribution blocker.

## References
- Tauri discussion on Linux/WebKitGTK: https://github.com/orgs/tauri-apps/discussions/8524
- Tauri issues: https://github.com/tauri-apps/tauri/issues/14427,
  https://github.com/tauri-apps/tauri/issues/9304, https://github.com/tauri-apps/tauri/issues/10702,
  https://github.com/tauri-apps/tauri/issues/16131, https://github.com/tauri-apps/tauri/issues/14963
- Tauri releases (v2.11.6 stable; v3 alpha with `tauri-runtime-cef`):
  https://api.github.com/repos/tauri-apps/tauri/releases
- Tauri single-instance plugin: https://v2.tauri.app/plugin/single-instance/
- Electron 38 (Wayland by default): https://www.electronjs.org/blog/electron-38-0
- Electron `app` API (single-instance lock): https://www.electronjs.org/docs/latest/api/app
- Framework comparison benchmark (indicative only):
  https://github.com/Elanis/web-to-desktop-framework-comparison
- Electrobun: https://github.com/blackboardsh/electrobun (issues #465, #554)
- Wails releases: https://api.github.com/repos/wailsapp/wails/releases
- Deno desktop: https://docs.deno.com/runtime/desktop/
