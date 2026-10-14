# galeo — Dependencies

- **Status**: Vetted 2026-09-25, before any code was written; trimmed the same day (owner review:
  own small modules instead of packages we'd barely use)
- **Related**: [ARCHITECTURE](ARCHITECTURE.md) · [ADR-003](decisions/ADR-003-rendering-pipeline-and-format-registry.md) ·
  [ADR-006](decisions/ADR-006-renderer-ui-framework.md) · [ADR-008](decisions/ADR-008-packaging-and-distribution.md) ·
  [Threat model](security/threat-model.md) SR-10

Every dependency must earn its place. This file records what was adopted, why, and what was
rejected, so later additions follow the same bar.

## Policy

1. **Need first.** Built-in platform or Node APIs and a few lines of our own code beat a package
   (see "Own modules and built-ins"). **A dependency must give substantial value *and* be used
   for more than a sliver of its surface.** If we'd use a small part of a small package, we write
   a self-owned module instead, with tests.
2. **Verify it's the real package.** The exact name exists on npm, its repository link points to
   the expected project, and it has long-standing adoption. Any name suggested by a person or an
   AI is unverified until checked.
3. **Health.** Released or committed within about 12 months, a responsive tracker, and adoption
   that signals community trust.
4. **Licence.** Runtime dependencies must be permissive and MIT-compatible (MIT, ISC, BSD,
   Apache-2.0; OFL for fonts). Copyleft (GPL, LGPL) is not allowed at runtime. MPL-2.0 is allowed
   only as a dev dependency. **Named exceptions** (owner, one package and one licence each, shipped
   unmodified, enforced by `scripts/lib/licences.mjs`): `elkjs` under EPL-2.0, Mermaid 12's layout
   engine (2026-10-06); About tells where its source is, as EPL-2.0 asks.
5. **Weight.** Anything heavy loads lazily in the renderer (ADR-003). Packages with native
   modules are avoided, since they need rebuilding for Electron.
6. **Hygiene** (SR-10): commit `package-lock.json`; CI uses `npm ci`; install scripts are
   disabled except on an allowlist (`.npmrc` sets `ignore-scripts=true`; `npm run setup` runs the
   allowlisted steps: Electron's binary download and the git hooks); npm audit/OSV scanning fails
   on high severity; exact versions for security-sensitive renderers (Mermaid, KaTeX, DOMPurify,
   sanitizer); Dependabot (`.github/dependabot.yml`) groups updates, with a cooldown for
   non-security ones; Electron security releases follow SR-09.
7. **Wrap at the seams.** Third-party APIs sit behind our own modules (ports in `core/`, the
   format registry, the render pipeline), so any one of them can be replaced (ADR-007).

## Adopted

Registry data as of 2026-09-25: latest version, licence, last publish, weekly downloads.

### Runtime: shell and main process

| Package | Version | Licence | Last publish | Weekly dl | Role / notes |
|---|---|---|---|---|---|
| `electron` | 44.7.0 | MIT | 2026-10-07 | 6.9 M | Shell (ADR-001). Chromium 152, Node 24 |
| `zod` | 4.6.x | MIT | 2026-09-25 | 274 M | Runtime schemas for IPC, settings and sessions (SR-11, SR-17). Main only: the preload and renderer import its inferred types, never its code |
| unified pipeline (`remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-raw`, `rehype-sanitize`, …) | see the renderer pipeline table | MIT | — | — | Link and image extraction in main for capability checks (ADR-004): the **same** parse and sanitizer as the renderer, up to sanitizing, shared from `src/shared/markdown/`, so main's link set is the page's link set (a fuzz test compares them). This replaced the planned separate `mdast-util-from-markdown` extractor (2026-09-27), which would have needed its own raw-HTML handling |

### Runtime: renderer, chrome UI

| Package | Version | Licence | Last publish | Weekly dl | Role / notes |
|---|---|---|---|---|---|
| `react`, `react-dom` | 19.3.x | MIT | 2026-09-23 | 169 M | Chrome UI (ADR-006) |
| `react-aria-components` | 1.21.x | Apache-2.0 | 2026-09-25 | 4.2 M | Accessible tabs, drag and drop, combobox, dialogs, menus (Adobe). Apache-2.0 NOTICE shipped in the about/licences view |

### Runtime: renderer, rendering pipeline (worker, ADR-003)

| Package | Version | Licence | Last publish | Weekly dl | Role / notes |
|---|---|---|---|---|---|
| `unified` | 11.0.x | MIT | 2024-06-19 | 53 M | Pipeline core. Stable and mature (unified collective), not stale |
| `remark-parse`, `remark-gfm`, `remark-frontmatter`, `remark-math`, `remark-rehype` | 11 / 4 / 5 / 6 / 11 | MIT | 2023–2025 | 5–49 M | Markdown → mdast → hast. The usual Astro/MDX set |
| `remark-mdx` | 3.1.x | MIT | 2025-08-29 | 12 M | v0.2: MDX parse only (never evaluated) |
| `rehype-raw`, `rehype-sanitize`, `rehype-slug`, `rehype-stringify` | 7 / 6 / 6 / 10 | MIT | 2023–2024 | 4–17 M | Raw HTML → allowlist sanitize (SR-02) → slugs → HTML string |
| `shiki`, `@shikijs/rehype` | 4.5.x | MIT | 2026-10-01 | 21 M / 680 k | Code highlighting with the GitHub themes; grammars loaded per document |
| `katex`, `rehype-katex` | 0.19.x / 7.0.x | MIT | 2026-10-01 / 2024-08-19 | 24 M / 6.8 M | Math (`trust: false`, limits; SR-03). **Exact version pin**; `rehype-katex`, Mermaid and `micromark-extension-math` ask for `^0.16`, so `overrides` in `package.json` give them the pinned `katex` (without them, math ran on a nested 0.16 copy, under a KaTeX advisory fixed in 0.18.2, and only the stylesheet followed the pin) |
| `mermaid` | 12.1.0 | MIT | 2026-10-02 | 15 M | Diagrams, lazy on the UI thread, `securityLevel: 'strict'` (SR-03). Heavy (split into chunks); **exact version pin**. On 12.x since 2026-10-06 (owner): ELK layout (12's default; brings `elkjs`, EPL-2.0, allowed by name under "Licence"), `look: 'classic'` |
| `dompurify` | 3.4.16 | MPL-2.0 OR Apache-2.0 (Apache chosen) | 2026-09-23 | 59 M | Sanitizes Mermaid SVG output before insertion. Already a Mermaid dependency. **Exact version pin** |

### Runtime: source views (CodeMirror 6, ADR-003)

| Package | Version | Licence | Last publish | Weekly dl | Role / notes |
|---|---|---|---|---|---|
| `@codemirror/state`, `@codemirror/view`, `@codemirror/search`, `@codemirror/language`, `@codemirror/commands` | 6.x | MIT | 2026-08/09 | 8–13 M | Individual packages rather than the `codemirror` meta package, to control bundle contents |
| `@codemirror/lang-markdown`, `@codemirror/language-data`, `@codemirror/legacy-modes` | 6.5.x | MIT | 2026 | 3–5 M | Markdown source highlighting; lazily loaded language packs for other formats; a base for the log grammar |
| `@lezer/highlight` | 1.2.x | MIT | 2026-09-24 | 15 M | Highlight `tags` for the source view's own highlight style (colours from the `--galeo-*` tokens). Already a dependency of every `@codemirror/language*` package, same maintainer; declared directly because our code imports it (added 2026-09-27, owner) |
| `@codemirror/merge` | 6.12.x | MIT | 2026-06-09 | 2.3 M | v0.2: the read-only diff behind "Show diff" when a file changes on disk while it has unsaved edits (ADR-013). Same maintainer as the other `@codemirror/*` packages; its dependencies are packages we already ship. Lazy, loaded with the first diff (added 2026-10-08, owner) |

### Runtime: fonts (vendored, offline)

Font files are **copied into the repo** (`assets/fonts/`, with their OFL-1.1 licence texts), not
installed as npm packages. They are plain assets with no code and change rarely.

| Font | Licence | Role |
|---|---|---|
| Inter (variable) | OFL-1.1 | Default UI and prose sans |
| Source Serif 4 (variable) | OFL-1.1 | Optional serif for prose |
| JetBrains Mono (variable) | OFL-1.1 | Code, source and log views |

### Development and build

| Package | Version | Licence | Last publish | Role / notes |
|---|---|---|---|---|
| `typescript` | 7.0.x | Apache-2.0 | 2026-09-25 | Type checking only (`tsc -b` over per-folder project references; it emits nothing but declarations into the ignored `out/tsc/`), native compiler. Fallback: 6.0.3 if a tool needs the JS compiler API (TS 7 does not ship it) |
| `@types/node` | 24.x | MIT | 2026-09 | Node API types for `main`/`preload`, pinned to the Node 24 major. Electron depends on it transitively; listed explicitly so the typecheck doesn't rest on a transitive package (added 2026-09-26) |
| `@types/react`, `@types/react-dom` | 19.3.x | MIT | 2026-09 | React types (React ships none) for the renderer typecheck (added 2026-09-26) |
| `vite` | 8.3.x | MIT | 2026-09-24 | Builds all four bundles: main and preload (library/SSR builds), renderer, worker (ADR-008). A small own dev script (`scripts/dev.mjs`) restarts Electron when main or preload rebuild |
| `@vitejs/plugin-react` | 6.1.x | MIT | 2026-09 | JSX + fast refresh for Vite 8 (1 dependency; its Babel/compiler peers are optional and not used) |
| `electron-builder` | 26.17.x | MIT | 2026-09-26 | Packaging: `.deb` (official) + AppImage (secondary), and unsigned macOS `.dmg`/`.zip` and Windows NSIS previews. **Verified**: its configuration schema has `electronFuses` (fuses at package time, SR-08), and its v26 `.deb` post-install installs an AppArmor `userns` profile on Ubuntu 24.04+ |
| `@electron/fuses` | 2.1.x | MIT | 2026-06-29 | Reading fuses back from the packaged binary in CI (SR-08) |
| `happy-dom` | 20.14.x | MIT | 2026-09 | DOM environment for the `renderer` vitest project. Lighter and faster than jsdom; renderer tests are unit-level, so its missing layout APIs don't matter (added 2026-09-26) |
| `vitest` | 5.0.x | MIT | 2026-09-25 | Unit and renderer tests (Node ≥ 22.12; the project pins Node 24) |
| `@playwright/test` | 1.63.x | Apache-2.0 | 2026-09-25 | End-to-end tests via Playwright's Electron support (`_electron`, which Playwright labels experimental) |
| `@axe-core/playwright` | 4.13.x | MPL-2.0 (dev only) | 2026-09-02 | Accessibility checks in end-to-end tests |
| `husky`, `@commitlint/cli`, `@commitlint/config-conventional` | 9.1 / 21.2 / 21.2 | MIT | 2026-09 | Commit hooks + Conventional Commits |

### CI: GitHub Actions

Only GitHub's own Actions, each pinned by commit SHA (SR-10) and updated weekly by Dependabot.

| Action | Version | Used in | Role |
|---|---|---|---|
| `actions/checkout` | 7.0.1 | CI, PR title, release | Check out the commit, without persisting credentials |
| `actions/setup-node` | 7.1.0 | CI, PR title, release | Node from `.nvmrc` (CI caches npm; the release build doesn't) |
| `actions/upload-artifact` | 7.0.2 | CI, release | Performance results and failure reports; the release packages for the next jobs |
| `actions/download-artifact` | 8.0.2 | Release | Hands the built packages to the attest and release jobs, which hold the signing and write permissions (ADR-017, added 2026-10-14) |
| `actions/attest-build-provenance` | 4.2.2 | Release | GitHub artifact attestations for the `.deb` and the AppImage (SR-10, ADR-017, added 2026-10-14) |

## Own modules and built-ins

Self-owned modules live under `core/` or `renderer/lib/`, with unit tests (they replace packages,
so they carry the tests those packages would have had).

| Need | Own module / built-in | Replaces | Approx. size |
|---|---|---|---|
| Watching open files | `FileWatcher` adapter: one `fs.watch` per **parent directory**, shared by its files and filtered by name, so it survives temp-file + rename saves; Core's coalescing watcher on top (quiet window, rate cap, `stat` polling where a folder can't be watched) | `chokidar` | ~200 lines |
| Quick-open folder walk | Bounded walker on `fs.opendir` (count, depth, time; no symlink escape; loop detection; excludes) | `fdir` | ~80 lines |
| Fuzzy matching (quick open, palette) | Subsequence matcher with path-aware scoring (basename, word-boundary and contiguity bonuses), behind a `Matcher` interface | `@leeoniya/ufuzzy` | ~120 lines |
| Encoding detection | UTF-8 strict → BOM (UTF-16/32) → Windows-1252 fallback with a banner and "Reopen with encoding…"; decode with `TextDecoder` | `chardet` | ~40 lines |
| Frontmatter display | Shown as a collapsible, syntax-highlighted YAML block (never parsed) | `yaml` | 0 |
| Dev orchestration | `scripts/dev.mjs`: Vite watch builds + Electron restart on main/preload change; renderer hot reload via Vite's dev server | `electron-vite` | ~60 lines |
| Import-boundary check (ADR-007) | `scripts/check-boundaries.mjs` scanning `import` specifiers per folder, plus value-import reachability of `zod` from the preload and renderer | `dependency-cruiser` (18 deps; needs the TS JS API, which TS 7 lacks) | ~200 lines |
| Decoding text | `TextDecoder` (WHATWG encodings) | — | — |
| Binary detection | Own sniff (NUL bytes / invalid UTF-8 ratio in the first 8 KB) | — | — |
| Atomic writes, fsync, modes | `node:fs` | — | — |
| Single instance, menus and accelerators, protocol, request blocking, permissions | Electron APIs | — | — |
| Rendered-view find | CSS Custom Highlight API + DOM `TreeWalker` (ADR-003) | — | — |
| Registry mirror store | `useSyncExternalStore` (ADR-006) | — | — |
| Debounce, LRU for warm tabs | Own few-line utilities | — | — |

## Rejected

| Package | Reason |
|---|---|
| `jschardet` | **LGPL-2.1+**, copyleft at runtime |
| `fzf` (fzf-for-js) | Last release 2023-04, stale |
| `@leeoniya/ufuzzy` | Healthy but single-maintainer, and we'd use a small part. Own matcher instead |
| `chokidar`, `fdir`, `chardet`, `yaml`, `@fontsource-variable/*` | Well adopted, but we'd use a sliver of each. Replaced by own modules, built-ins or vendored assets (see above) |
| `fuse.js` | Healthy (Apache-2.0), but slower on large path lists; our matcher is small enough to own |
| `@parcel/watcher` | Native module (rebuild per Electron version, larger supply-chain surface); per-file watching doesn't need its recursive performance |
| `valibot` | Healthy and smaller than zod, but schemas run only in main and preload, where size doesn't matter. zod has broader familiarity |
| `codemirror` (meta package) | Pulls basic-setup extras; individual `@codemirror/*` packages give explicit control |
| Monaco, markdown-it, marked, highlight.js, Prism | See ADR-003 |
| Svelte, Solid, Lit | See ADR-006 |
| Electron Forge | See ADR-008. Its `plugin-vite` is on 7.11.x (2026-07) |
| `electron-vite` | Lags Vite (5.x supports Vite ≤ 7; 6.0 in beta since 2026-04 with open Vite 8 bugs, alex8088/electron-vite#894, #906, #925). Plain Vite 8 + own dev script instead |
| `dependency-cruiser` | See "Built-ins instead of packages" |

## Licence notices to ship

`build/licences.ts` gathers them at build time from `package-lock.json` (every runtime package's
licence, licence and notice files) for the About dialog (palette: "About galeo"), and fails the
build on a runtime licence that isn't permissive; `verify:package` checks they are packaged. The
about/licences view and the packages must include:
- the MIT/ISC/BSD notices of runtime dependencies (generated at build time);
- the **Apache-2.0** NOTICE files (`react-aria-components` and its `@react-aria/*` and
  `@internationalized/*` dependencies, `dompurify` under its Apache option);
- the **OFL-1.1** texts for the vendored fonts;
- Chromium's licences, which Electron ships (`LICENSES.chromium.html`).

## Watch list and revisit triggers

- **semantic-release** (vetted 2026-09-25, removed 2026-09-29): it always installs
  `@semantic-release/npm`, which bundles `npm` and its `undici`. That `undici` had a high-severity
  advisory with no fixed npm 11 release, and a bundled copy can't be overridden, so the audit gate
  failed. Nothing ran it yet. The release workflow uses no release tool: a tag starts it, and the
  maintainer writes the notes ([ADR-017](decisions/ADR-017-release-workflow-with-attestations.md)).
- **TypeScript 7** friction with any tool: fall back to 6.0.3 for that tool.
- **Maintainer health**: any adopted package with no release for over 12 months is re-vetted;
  small ones are replaced by own modules.
- Run this vetting again for every new runtime dependency, and record the result here.
