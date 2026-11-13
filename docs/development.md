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
| `npm run build:demo` | The [website](#website)'s live demo into `out/demo` (ADR-037): the renderer, with `src/demo` standing in for main |
| `npm run test:demo` | Playwright tests of the built demo, served as Pages serves it and opened in Electron's Chromium (`npm run build:demo` first) |
| `npm run site:screenshots` | The [website](#website)'s screenshots from the built app, into `site/screenshots/` (`npm run build` first; run it through `npm run headless`) |
| `npm run package` | Build, then package for the current OS into `release/` (Linux: `.deb` and AppImage; macOS: `.dmg` and `.zip`; Windows: setup and portable `.exe`) |
| `npm run verify:package` | Check the packaged binary: fuses as configured, a flipped fuse detected, the app starts, the `.deb`'s desktop entry and icon, the licence notices; the `.rpm`'s scripts, desktop entry and icon when one is built and `rpm` is installed (`GALEO_VERIFY_RPM=1`, as in CI, makes either missing a failure) |
| `npm run headless -- <cmd>` | Run a command on a virtual display (Linux, needs the `xvfb` package), so no windows open on your desktop: wrap the Playwright commands and `verify:package` in it |
| `npm run boundaries` | Check the import rules below (`scripts/check-boundaries.mjs`) |
| `npm run check:bundle` | After `npm run build`: what the window and the render worker load up front, failing if KaTeX, Shiki, CodeMirror, Mermaid, DOMPurify or the MDX parser is among it (they load with the first document that needs them) |
| `npm run check:exports` | Fail on an export in `src/` that no other file imports: drop the `export`, or the code if nothing uses it; exports only tests import are allowed (`scripts/check-exports.mjs`) |
| `npm run check:demo` | After `npm run build:demo`: fail on source maps in `out/demo` or a demo over 24 MB (`scripts/demo-size.mjs`) |
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
stylesheet, the screenshots and `copy.js` (the command blocks' copy buttons, which the page works without),
with no build step. Its security policy allows its own files only: no inline script, nothing from elsewhere. The Pages workflow
(`.github/workflows/pages.yml`) publishes it when `site/` changes on `main`, when a release is
published, or when started by hand. Each run also rebuilds the signed apt repository under `/apt/`
from the latest release's `.deb` (`scripts/apt-repo.sh`, ADR-029; key procedures in
[Releasing](RELEASING.md)), and builds the live demo under `/demo/` from that release's tag (ADR-037). The demo
is `src/demo/`: it gives the renderer a `window.galeo` answered in the page by `src/core/` over sample files held in
memory (`src/demo/samples/`). Try it locally with `npm run build:demo` and any static server on `out/demo`. To retake the screenshots after a UI change:

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

galeo has one maintainer (the owner; other docs say "owner"). GitHub holds what is planned and what is done;
the repository holds how and why.

| What | Where |
|---|---|
| Bugs, feature requests, tasks, and whether each is open or done | [Issues](https://github.com/SWEStash/galeo/issues) |
| What a release ships | Its milestone (`v0.8`); the [PRD](PRD.md)'s stories describe the release, and where they differ the milestone and each story's issue win |
| How the project runs: filing, claiming, done, releases, what agents may do | This section |
| Decisions | A design decision (architecture, a dependency, a security or process rule that lasts) is an ADR in [`docs/decisions/`](decisions/); a smaller choice is the issue comment that settles it |
| Release evidence | [VALIDATION](VALIDATION.md); a check not yet run names the issue that owns it |
| Anything else | The doc the README's *Documentation* list gives for that topic |

Working plans stay outside the repository, in a git-ignored `.local/` folder. They refer to issues by
number and never track an issue's status: the issue does.

**When two documents disagree**, the owner in the table above wins and the other document is fixed in the
same commit. When this section and practice disagree, this section is fixed first, in its own commit, and
then the work follows it.

**Writing.** Issues and comments are short and precise, like commit messages: bullets and short lines, no
prose, no filler. Enough context to understand the issue at a glance; detail that only matters while
working stays in the working plan. Name files and functions in code spans, commits by hash, CI runs by
link. Don't hard-wrap issue text: GitHub keeps every line break. Keys and paths go in code spans, since
`\)` outside one is a Markdown escape (`Ctrl+\` would lose its backslash).

**Filing.** One issue per problem or change.

- Type: *Bug*, *Feature* or *Task* (the repository's issue types, not labels).
- Title: the symptom for a bug ("Renaming a profile keeps the launcher's old name"), the outcome otherwise
  ("Close others in the tab menu"). Under about 70 characters.
- Body, written for someone who doesn't know the code:
  - **Context**: the feature involved, where it shows in the app, why it matters. One to three lines.
  - Bug: *Steps*, *Expected*, *Actual*, *Version and OS*, *Impact* (who is hit, how badly, any workaround).
  - Feature: *Problem*; *Proposal* and *Out of scope* when they help.
  - Task: *Context* and *Proposal*.
  - **Done when**: a checklist of observable results, a regression test among them for a bug. It's this
    issue's acceptance criteria; the project-wide definition of done is under *Closing*.
  - *Notes*: leads, constraints, links. Optional.

  The issue forms ask the public for the essentials; the maintainer adds Context, Done when and any
  `platform:` label on triage, when first reading a new issue. Outside reporters use the *Bug* or *Feature request* form, whichever is
  closer, also for a question; the *Task* form is for the maintainer.
- An issue labelled `needs decision` lists the options instead of *Done when*. The decision is recorded in a
  comment and *Done when* is added before the issue is claimed.
- Labels only for what a type can't say: `platform: macos`, `platform: windows`, `platform: x11`,
  `needs decision` (the maintainer chooses before work starts). Bugs on the macOS and Windows previews are
  welcome; the previews are unsupported in the sense that releases run no manual checks on them
  ([RELEASING](RELEASING.md)).
- Security problems never go in a public issue: see [CONTRIBUTING](../CONTRIBUTING.md).

**Found while working on something else.** A follow-up that is its own change is a new issue that links
the one it came from; a fact about the issue you're on is a comment there. A question that blocks an issue
is a comment on that issue; a choice the maintainer has to make is an issue labelled `needs decision`; any
other question becomes a *Task* whose *Done when* is the answer, recorded.

**Scope changes.** The issue body is edited to the new scope (*Done when* included), with a one-line
comment saying what changed and why. Moving it to another release is a milestone change (below).

**Work only the maintainer can do** (a secret, the signing key, a release, an approval) is a *Task*
assigned to the maintainer, written as a runbook: what is needed, where it lives, what to run, what to look
for, and what to send back. It waits there, visible, not in a private note.

**Planning and claiming.** No milestone: not scheduled. A milestone: that release ships it. Assigned: in
progress; an issue is claimed only once it has *Done when*. Nothing else marks progress, so no "working on
it" comments. Moving an issue to another release changes its milestone, with a one-line comment saying why.

- **Picking the next issue**: unassigned, with *Done when*, not `needs decision`. The milestone's issues
  of the next release first, bugs before features and tasks, then oldest first; issues with no milestone after
  that. A comment
  from the maintainer on an issue overrides this order.
- **Claiming**: the issue is assigned to the maintainer when work starts (agents working for the maintainer
  do this too) and unassigned when work on it stops (parked, blocked, or handed back), not when a session
  ends.
- **Work in progress** stays in the working tree or in local commits until it passes the preflight; nothing
  is pushed half done. Context for the next session goes in the working plan, never in a status comment.

**Starting a session**, in this order; nothing else needs a handoff note:

1. `git status -sb`: uncommitted changes or commits not yet pushed are work in progress; finish or push them
   first.
2. The issues assigned to the maintainer (`gh issue list --assignee @me`): claimed work, to continue.
3. The working plan's status, if a release has one: the release's order of work, its evidence, and the
   maintainer's calls that don't belong in a public issue.
4. Nothing claimed: pick by the order above. When more than one issue fits, or the plan and the issues
   disagree, ask the maintainer which to take.

**Comments.** New facts only: a repro, a finding, a decision with its reason, the commit or run that
changes things. One fact per comment, a few lines; never restate the issue or report status. A decision
that changes the design is an ADR, and the comment links it.

**Closing.** The commit on `main` that resolves an issue says so in its footer: `Fixes #72` for a bug,
`Closes #72` otherwise. An issue closed without code is closed as *not planned* with one line why; a
duplicate links the other issue. Done means: the issue's *Done when* is met, on `main`, CI green, a
regression test for a bug, and the [change checklist](#change-checklist). For an issue labelled `platform: macos` or `platform: windows`, also a
green *Platforms* run on the fixing commit ([Before pushing](#before-pushing)); for `platform: x11`, a manual
check on the reference platform under X11. A comment on the closed issue links the run or states the check
(agents draft it, as any post).

**Releases.** The maintainer picks a release's issues into its milestone; a patch release gets a milestone
only when issues are planned for it. At the release, issues still open move to the next milestone or to
none, and the milestone closes; [RELEASING](RELEASING.md) has the order. A
version is **released** once its GitHub release is published (RELEASING step 9); apt users get it when the
Pages deploy after it is green (step 11). A closed issue alone means on `main`, not released.

**Pull requests.** galeo takes issues from anyone, not code: outside pull requests aren't accepted yet
(CONTRIBUTING), and one that arrives is closed with a pointer to CONTRIBUTING. The maintainer commits
straight to `main` and pushes after the preflight ([Before pushing](#before-pushing)), which keeps CI
minutes down; pull requests will come in with outside contributions. Dependabot's updates are
applied by hand on `main`, one commit each, and its pull request is closed; CI skips Dependabot's pull
requests, and docs-only pushes.

**Agents** follow this section and act through the maintainer's account (`gh`). They draft issues,
comments, closes, labels and milestone changes, and post them only after the maintainer approves: every
post is public. Assigning or unassigning an issue when work on it starts or stops needs no approval.
Pushing needs the maintainer's approval each time, after the preflight; agents open no pull requests.
They also ask first before adding a dependency not in [dependencies](dependencies.md), departing from an
accepted ADR, or changing the repository's settings or visibility.

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
- **Decisions**: never edit an accepted ADR's decision. Record a new ADR that supersedes it: its header
  says `Supersedes:` and what, and the old ADR's status becomes `Superseded by` the new one (ADR-012
  shows both).
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
