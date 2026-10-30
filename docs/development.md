# Developing galeo

galeo is a desktop reader and editor for Markdown/text/log files: Electron 45, all TypeScript, React 19
chrome, unified rendering pipeline in a worker, zero network. Linux is official; macOS and Windows
are previews.

## Commands

Node 24 (`mise` or `.nvmrc`), npm.

| Command | What it does |
|---|---|
| `npm ci && npm run setup` | Install dependencies (lifecycle scripts are disabled), then run the allowlisted setup steps |
| `npm run typecheck` | Type-check every source folder (`tsc -b`, TypeScript 7), failing on unused locals and parameters |
| `npm run dev` | Run the app with renderer hot reload; Electron restarts when main or preload change |
| `npm run build` | Production bundles for main, preload and renderer (with the render worker) into `out/` |
| `npm start` | Run the built app from `out/` |
| `npm test` | All vitest projects (`test:unit` for Node-side code and scripts, `test:renderer` for happy-dom) |
| `npm run test:e2e` | Playwright end-to-end tests against the built app (`npm run build` first) |
| `npm run test:no-network` | Zero-network proof on Linux: the built app runs under `strace` and must make no network `connect()` (needs `strace`) |
| `npm run test:perf` | Timings for cold start, tabs, diagrams, data views, a 100 MB log, typing in split view, and memory (`GALEO_PERF=1 npm run build` first); `GALEO_PERF_ENFORCE=1` holds them to the budgets, see [performance runs](#performance-runs) |
| `npm run package` | Build, then package for the current OS into `release/` (Linux: `.deb` and AppImage) |
| `npm run verify:package` | Check the packaged binary: fuses as configured, a flipped fuse detected, the app starts, the `.deb`'s desktop entry and icon, the licence notices |
| `npm run headless -- <cmd>` | Run a command on a virtual display (Linux, needs the `xvfb` package), so no windows open on your desktop: wrap the Playwright commands and `verify:package` in it |
| `npm run boundaries` | Check the import rules below (`scripts/check-boundaries.mjs`) |
| `npm run check:bundle` | After `npm run build`: what the window and the render worker load up front, failing if KaTeX, Shiki, CodeMirror, Mermaid, DOMPurify or the MDX parser is among it (they load with the first document that needs them) |
| `npm run check:exports` | Fail on an export in `src/` that no other file imports: drop the `export`, or the code if nothing uses it; exports only tests import are allowed (`scripts/check-exports.mjs`) |
| `npm run check:docs` | Check the docs' relative links and `#anchors`, ADR and SR ids, and repository paths in code spans (`scripts/check-docs.mjs`; web links are never fetched) |
| `npm run check:portable` | Fail on test lines that pass on Linux but not on macOS or Windows: Ctrl where macOS uses Cmd, Cmd+←/→ (by line on macOS), fixture paths expected with `/`, GNU-only tools; `portable: <reason>` in a comment keeps one (`scripts/check-portable-tests.mjs`) |
| `npm run check` | Typecheck, boundaries, the exports and docs checks, and tests: run it before every commit |
| `npm run preflight` | CI's Linux job on this machine (audit, check, build and bundle check, e2e, no-network, perf, package, verify), then the e2e specs changed since the last push, 5 times each: run it before every push |
| `sh scripts/render-icons.sh` | Render the app icon PNGs from `packaging/icons/*.svg` after changing them (needs `rsvg-convert`: `librsvg2-bin`) |

On Ubuntu 24.04+, unprivileged user namespaces are restricted, so the development Electron binary
can't start its sandbox. Run `sudo scripts/dev-sandbox-setup.sh` once per checkout: it installs an
AppArmor profile for `node_modules/electron/dist/electron`, like the one the `.deb` installs.

To try the `.deb` on your desktop, install it with `sudo apt install ./release/galeo_*.deb` and
remove it with `sudo apt remove galeo`. apt may print "Download is performed unsandboxed as
root": its `_apt` user can't read your home folder, so apt reads the file as root. The notice is
harmless. Copy the `.deb` to `/tmp` first to avoid it.

## Performance runs

The budgets in `tests/perf/budgets.json` only mean something on a quiet machine (load average under
1.5) with nothing else running: a long test run beforehand heats a laptop and slows it. Then:

```sh
GALEO_PERF=1 npm run build
GALEO_PERF_ENFORCE=1 npm run headless -- npm run test:perf
npm run build   # back to the normal build
```

Timings are medians: of 10 runs for cold start, tabs and typing, of 3 for the data views and
memory, and per frame while scrolling for diagrams; for the log, per frame while paging and per
appended line, in one run. The release records them in [VALIDATION](VALIDATION.md#performance).

## Before pushing

Run `npm run preflight` and push only when it ends with "all green". On a busy machine it may end
with "all green except the performance smoke": push then only if its medians are close to the ones
recorded before, since CI's runner is faster. A push to `main` runs CI on Linux only. macOS and Windows
run in the *Platforms* workflow (`.github/workflows/platforms.yml`, ADR-027), whose minutes come from a
quota: it runs when a commit is pushed to the `ci/platforms` branch (`git push --force origin
HEAD:ci/platforms`; the branch only points at the commit under test, nothing is committed on it), when
started by hand, and in the release workflow. One run shows every failure: packaging jobs for the four
builds, and the end-to-end suite split across three jobs per system, each test tried twice so a flake shows
as flaky. After fixing, run it by hand with `rerun_of` set to that run's id: it runs only the end-to-end
tests that failed there (`grep` narrows it to a title instead). Gather platform fixes into one run.

Before any of that, two checks run on Linux in `npm run check` and the preflight: the unit tests that read
paths, links and keys the Windows or macOS way, and `npm run check:portable`, which flags tests that would
fail there (keys pressed as Ctrl where macOS uses Cmd, fixture paths expected with `/`, GNU-only tools).
These differences have broken tests on those systems before:

- **Folders**: on macOS and Windows the state folder sits inside the config folder (`appDirs`).
  Paths use `\` on Windows; build them with `path.join`, never with `/`.
- **Keys**: Cmd stands in for Ctrl on macOS, and some commands have their own macOS keys
  (`MACOS` in `src/shared/keymap.ts`), such as Cmd+Q to quit.
- **Watched files**: macOS can miss or delay a change made just after watching starts, so repeat the
  change until it's seen (`until` in the watcher tests). Change a file the app watches with
  `saveFile` (`tests/helpers/save.ts`): a plain write empties it first, and the app may read that.
- **Cleanup**: on Windows an app's child processes can hold its files for a moment after it exits.
  Remove a home the app ran on with `removeTempHome`.
- **POSIX-only checks** (modes, symlinks, FIFOs, shell scripts) are skipped on Windows.

## Architecture

Read [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) first; its [source layout](ARCHITECTURE.md#9-source-layout-adr-007)
shows what each folder of `src/` holds. The *why* is in [`docs/decisions/`](decisions/), the security
requirements are in [`docs/security/threat-model.md`](security/threat-model.md), and the UX spec is in
[`docs/design/ux.md`](design/ux.md).

## Conventions (non-negotiable)

- **Justify choices on their own merits** (requirements, ADRs, measurements), not by pointing at
  other products.
- **Dependencies** must be well adopted, stable, maintained **and** substantially used.
  Otherwise write a small own module with tests. Every addition is vetted and recorded in
  [`docs/dependencies.md`](dependencies.md) before it's installed. Pin exact versions.
- **Security requirements** (the threat model's SR-xx) are acceptance criteria, not suggestions.
  The sandbox is on by default. Only the user can opt out, per launch, and the app then warns in
  every window (ADR-008). The one exception: after a real sandbox failure, the Linux launcher
  wrapper relaunches unsandboxed only to show the "sandbox unavailable" choice (ADR-009). Zero network is enforced and
  proven in CI. Capabilities are verified in main.
- **Import boundaries**: `core/` and `shared/` never import `electron`, `node:*` or DOM APIs. The
  renderer never imports `electron` or `node:*`. Imports point inward only (`core` → `shared`;
  `main` → `core`, `shared`; `preload`/`renderer` → `shared`). zod runs in main only: the preload
  and renderer must not reach it through any value import, so they use `import type` for schema
  modules. `npm run boundaries` enforces all of this.
- **Decisions**: never edit an accepted ADR's decision. Record a new ADR that supersedes it.
- **Diagrams** in the docs are Mermaid, so GitHub and galeo both draw them. UI mock-ups and
  directory trees stay as text, which Mermaid can't lay out.
- **Docs placement**: PRD, ADRs and official docs go in `docs/`. Working notes stay out of the
  repo, and commit messages and code never reference private task IDs.
- **Commits**: Conventional Commits (enforced by commitlint).
- **Tests**: tests first for `core/` and security logic. Every bug fix gets a regression test.
  e2e tests wait on app events, never on sleeps.

## Change checklist

- [ ] `npm run check` is green (typecheck, import boundaries, unneeded exports, docs references, tests)
- [ ] New behaviour has tests, including the failure branches
- [ ] No new dependency without a `docs/dependencies.md` entry
- [ ] Relevant SR-xx requirements still hold. Nothing loosens `webPreferences`, the CSP or the
      network guard
- [ ] Docs updated if behaviour or commands changed
- [ ] Commit messages are Conventional Commits
