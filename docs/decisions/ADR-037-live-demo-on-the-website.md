# ADR-037 — A live demo on the website

- Status: Accepted (2026-11-13, owner)
- Date: 2026-11-13
- Deciders: project owner
- Builds on: [ADR-007](ADR-007-platform-seam.md) (platform seam: a sixth source folder, its rules unchanged),
  [ADR-004](ADR-004-security-and-zero-network.md) (CSP and Trusted Types), [ADR-029](ADR-029-apt-repository-on-github-pages.md)
  (the Pages site and its workflow)
- Issue: [#41](https://github.com/SWEStash/galeo/issues/41)

## Context

The website shows screenshots. galeo reads local files with no network, so trying it means installing it. The
owner picked option A on #41 (2026-11-12): the real renderer on the site, against a stand-in for the app's API,
with bundled samples, after a one-day spike.

The spike (2026-11-13) showed the renderer runs unchanged on a static page under the app's own CSP and Trusted
Types, given a `window.galeo`: the renderer talks to the app through nothing else (ADR-007). Main's logic for
tabs, reads, saves, edit grants, tab search and find in all tabs is in `src/core/`, free of Electron and Node,
behind ports.

## Decision

1. **A `src/demo/` folder**, a second host for the renderer: it builds `window.galeo` with the app's own
   `buildApi` and answers every channel in the page, with core's logic over an in-memory `FileSystem` holding the
   sample files. It may import `shared/`, `core/` and `renderer/`; like the renderer it imports no Electron, no
   Node and no zod (`scripts/check-boundaries.mjs`). Nothing in `main/`, `preload/` or `renderer/` changes for it.
2. **What the demo does.** Tabs, tab search, the overview, the palette, views, the outline, find, themes,
   pinning, copy, Ctrl+E edits and saves (in memory, gone on reload), ticking task boxes, a log that grows.
   What needs the app (files, quick open over folders, windows, profiles, PDF, launchers, watching a folder)
   says so in a notice with a link to the install steps. Keys follow the visitor's system (⌘ on a Mac).
3. **Security.** The demo's page carries the app's CSP and Trusted Types as a meta tag (Pages sends no headers):
   scripts, workers, styles, fonts and requests from the site only. It uses the same sanitizer and pipeline, reads
   no URL parameters, cookies or storage, and requests nothing from another origin (an end-to-end test checks
   every request). Its documents are the bundled samples and what the visitor types.
4. **Built from the release.** The Pages workflow builds the demo from the latest release's tag, in a job with
   read-only contents and no secrets, and publishes it under `/demo/`. A release without the demo has none. CI
   builds it on every push and holds it to a size budget (`npm run check:demo`: 24 MB, no source maps) and a
   first-view budget (6 MB, in `npm run test:demo`).
5. **The site links to it** under the hero screenshot (*See it in action*), from the release that first has it.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **The real renderer with core's logic in the page** | What visitors see is the app; the stand-in reuses main's own logic, so it can't drift far | A sixth folder; the demo is about 21 MB, mostly lazy | **Chosen** |
| A hand-written fake of the API | No core in the page | Duplicates main's behaviour, drifts with every change | Rejected |
| A "paste Markdown" reader (option B on #41) | Small | Not the app: no tabs, data views, editing | Rejected by the owner |
| Screenshots and a video only | Nothing to maintain | Can't be tried | Kept beside the demo |

## Consequences

- The demo is a second consumer of `core/`, so core stays free of Electron and Node in practice, not only by rule.
- A renderer change that needs a new channel needs a stand-in answer too: TypeScript fails the demo build until
  every channel has one.
- The site grows by about 21 MB per deploy; Pages allows 1 GB.
- Browsers keep some of galeo's keys for themselves (Ctrl+W, Ctrl+Tab, Ctrl+N): the demo's plan says so.
