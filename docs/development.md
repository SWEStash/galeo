# Developing galeo

galeo is a desktop reader and editor for Markdown, text, logs and data files: Electron 45, all TypeScript, React 19
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
| `npm run test:perf` | Timings for cold start, tabs, diagrams, data views, a 100 MB log, find in all tabs, typing in split view, and memory (`GALEO_PERF=1 npm run build` first); `GALEO_PERF_ENFORCE=1` holds them to the budgets, see [performance runs](#performance-runs) |
| `npm run site:screenshots` | The [website](#website)'s screenshots from the built app, into `site/screenshots/` (`npm run build` first; run it through `npm run headless`) |
| `npm run package` | Build, then package for the current OS into `release/` (Linux: `.deb` and AppImage; macOS: `.dmg` and `.zip`; Windows: setup and portable `.exe`) |
| `npm run verify:package` | Check the packaged binary: fuses as configured, a flipped fuse detected, the app starts, the `.deb`'s desktop entry and icon, the licence notices |
| `npm run headless -- <cmd>` | Run a command on a virtual display (Linux, needs the `xvfb` package), so no windows open on your desktop: wrap the Playwright commands and `verify:package` in it |
| `npm run boundaries` | Check the import rules below (`scripts/check-boundaries.mjs`) |
| `npm run check:bundle` | After `npm run build`: what the window and the render worker load up front, failing if KaTeX, Shiki, CodeMirror, Mermaid, DOMPurify or the MDX parser is among it (they load with the first document that needs them) |
| `npm run check:exports` | Fail on an export in `src/` that no other file imports: drop the `export`, or the code if nothing uses it; exports only tests import are allowed (`scripts/check-exports.mjs`) |
| `npm run check:docs` | Check the docs' relative links and `#anchors`, ADR and SR ids, and repository paths in code spans (`scripts/check-docs.mjs`; web links are never fetched) |
| `npm run check:portable` | Fail on test lines that pass on Linux but not on macOS or Windows: Ctrl where macOS uses Cmd, Cmd+←/→ (by line on macOS), fixture paths expected with `/`, GNU-only tools; `portable: <reason>` in a comment keeps one (`scripts/check-portable-tests.mjs`) |
| `npm run check:styles` | Fail on a px text size, a px spacing of 2 px or more, a px corner or a colour literal in `src/renderer/styles/app.css`: use the tokens in `tokens.css` (ADR-032), or say why on the line with `/* literal: … */` (`scripts/check-styles.mjs`) |
| `npm run check` | Typecheck, boundaries, the exports, docs, portable-tests and styles checks, and tests: run it before every commit |
| `npm run preflight` | CI's Linux job on this machine (audit, check, build and bundle check, e2e, no-network, perf, package, verify), then the e2e specs changed since the last push, 3 times each (the whole suite once more when a test helper changed): run it before every push, and only then |
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
appended line, in one run; for find in all tabs, main's longest busy spell, of 3 queries. The
release records them in [VALIDATION](VALIDATION.md#performance).

## Website

`site/` is the project's website, <https://swestash.github.io/galeo/>: one static page, its
stylesheet and the screenshots, with no build step and no script. The Pages workflow
(`.github/workflows/pages.yml`) publishes it when `site/` changes on `main`, when a release is
published, or when started by hand. Each run also rebuilds the signed apt repository under `/apt/`
from the latest release's `.deb` (`scripts/apt-repo.sh`, ADR-029; key procedures in
[Releasing](RELEASING.md)). To retake the screenshots after a UI change:

```sh
npm run build
npm run headless -- npm run site:screenshots
```

They open the documents in `tests/screenshots/showcase/` at 1280×800 on an emulated 2× display.
Look at each one before committing it.

To compare the interface before and after a change of its look, `tests/screenshots/chrome.spec.ts`
takes every surface around the document (tab bar and side panel states, menus, overlays, Settings,
banners, the empty window), light and dark, into `GALEO_SHOTS_DIR` (default `.local/design/shots/`,
not committed):

```sh
npm run build
GALEO_SHOTS_DIR=/tmp/before npm run headless -- npx playwright test --project=screenshots tests/screenshots/chrome.spec.ts
```

## How we work

galeo has one maintainer. GitHub holds what is planned and what is done; the repository holds how and why.

| What | Where |
|---|---|
| Bugs, feature requests, tasks, and whether each is open or done | [Issues](https://github.com/SWEStash/galeo/issues) |
| What a release ships | Its milestone (`v0.8`) |
| Decisions | ADRs in [`docs/decisions/`](decisions/) |
| Release evidence | [VALIDATION](VALIDATION.md) |

Working plans stay outside the repository. They refer to issues by number and never track an issue's
status: the issue does.

**Writing.** Issues and comments are short and precise, like commit messages: bullets and short lines, no
prose, no filler. Enough context to understand the issue at a glance; detail that only matters while
working stays in the working plan. Name files and functions in code spans, commits by hash, CI runs by
link.

**Filing.** One issue per problem or change.

- Type: *Bug*, *Feature* or *Task* (the repository's issue types, not labels).
- Title: the symptom for a bug ("Renaming a profile keeps the launcher's old name"), the outcome otherwise
  ("Close others in the tab menu"). Under about 70 characters.
- Body, bug: *Steps*, *Expected*, *Actual*, *Version and OS*. Feature or task: *Problem*, *Proposal*,
  *Notes* (constraints, risks, out of scope). The issue forms ask for these.
- Labels only for what a type can't say: `platform: macos`, `platform: windows`, `platform: x11`,
  `needs decision` (the maintainer chooses before work starts), `good first issue`.
- Security problems never go in a public issue: see [CONTRIBUTING](../CONTRIBUTING.md).

**Planning and claiming.** No milestone: not planned. A milestone: that release ships it. Assigned: in
progress. Nothing else marks progress, so no "working on it" comments. Moving an issue to another release
changes its milestone, with a one-line comment saying why.

**Comments.** New facts only: a repro, a finding, a decision with its reason, the commit or run that
changes things. One fact per comment, a few lines; never restate the issue or report status. A decision
that changes the design is an ADR, and the comment links it.

**Closing.** The commit on `main` that resolves an issue says so in its footer: `Fixes #72` for a bug,
`Closes #72` otherwise. An issue closed without code is closed as *not planned* with one line why; a
duplicate links the other issue. Done means: on `main`, CI green, a regression test for a bug, and the
[change checklist](#change-checklist).

**Releases.** The release plan picks its issues into the milestone. At the release, issues still open move
to the next milestone or to none, and the milestone closes with the tag.

**Pull requests.** Outside pull requests aren't accepted yet (CONTRIBUTING). The maintainer commits to
`main` and pushes after the preflight ([Before pushing](#before-pushing)). Dependabot's updates are
applied by hand on `main`, one commit each, and its pull request is closed; CI skips Dependabot's pull
requests, and docs-only pushes.

**Agents** follow this section and act through the maintainer's account (`gh`). They draft issues,
comments, closes, labels and milestone changes, and post them only after the maintainer approves: every
post is public.

## Before pushing

Run `npm run preflight` and push only when it ends with "all green". On a busy machine it may end
with "all green except the performance smoke": push then only if its medians are close to the ones
recorded before, since CI's runner is faster. A push to `main` runs CI on Linux only. macOS and Windows
run in the *Platforms* workflow (`.github/workflows/platforms.yml`, ADR-027). Its runs are long and its
jobs queue (the free plan runs at most five macOS jobs at once), so it runs only when a commit is pushed
to the `ci/platforms` branch (`git push --force origin
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
