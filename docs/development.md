# Developing galeo

galeo is a desktop reader for Markdown/text/log files: Electron 44, all TypeScript, React 19
chrome, unified rendering pipeline in a worker, zero network. Linux is official; macOS and Windows
are previews.

## Commands

Node 24 (`mise` or `.nvmrc`), npm.

| Command | What it does |
|---|---|
| `npm ci && npm run setup` | Install dependencies (lifecycle scripts are disabled), then run the allowlisted setup steps |
| `npm run typecheck` | Type-check every source folder (`tsc -b`, TypeScript 7) |
| `npm run dev` | Run the app with renderer hot reload; Electron restarts when main or preload change |
| `npm run build` | Production bundles for main, preload and renderer (with the render worker) into `out/` |
| `npm start` | Run the built app from `out/` |
| `npm test` | All vitest projects (`test:unit` for Node-side code and scripts, `test:renderer` for happy-dom) |
| `npm run test:e2e` | Playwright end-to-end tests against the built app (`npm run build` first) |
| `npm run test:no-network` | Zero-network proof on Linux: the built app runs under `strace` and must make no network `connect()` (needs `strace`) |
| `npm run test:perf` | Cold-start timings (`GALEO_PERF=1 npm run build` first); `GALEO_PERF_ENFORCE=1` holds them to the PRD budgets |
| `npm run package` | Build, then package for the current OS into `release/` (Linux: `.deb` and AppImage) |
| `npm run verify:package` | Check the packaged binary: fuses as configured, a flipped fuse detected, the app starts, the `.deb`'s desktop entry and icon |
| `npm run headless -- <cmd>` | Run a command on a virtual display (Linux, needs the `xvfb` package), so no windows open on your desktop |
| `npm run boundaries` | Check the import rules below (`scripts/check-boundaries.mjs`) |
| `npm run check` | Typecheck, boundaries and tests: run it before every commit |
| `sh scripts/render-icons.sh` | Render the app icon PNGs from `packaging/icons/*.svg` after changing them (needs `rsvg-convert`: `librsvg2-bin`) |

On Ubuntu 24.04+, unprivileged user namespaces are restricted, so the development Electron binary
can't start its sandbox. Run `sudo scripts/dev-sandbox-setup.sh` once per checkout: it installs an
AppArmor profile for `node_modules/electron/dist/electron`, like the one the `.deb` installs.

On Linux, wrap the Playwright commands and `verify:package` in `npm run headless --` to run them on
a virtual display (needs the `xvfb` package), so no windows open on your desktop.

To try the `.deb` on your desktop, install it with `sudo apt install ./release/galeo_*.deb` and
remove it with `sudo apt remove galeo`. apt may print "Download is performed unsandboxed as
root": its `_apt` user can't read your home folder, so apt reads the file as root. The notice is
harmless. Copy the `.deb` to `/tmp` first to avoid it.

## Architecture

Read [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) first. The *why* is in `docs/decisions/`
(ADR-001…009), the security requirements are in
[`docs/security/threat-model.md`](security/threat-model.md), and the UX spec is in
[`docs/design/ux.md`](design/ux.md).

Source layout (ADR-007). Dependencies point inward:

```
src/shared/    IPC contracts + domain types. No Node/Electron/DOM.
src/core/      Pure domain logic behind ports. Imports only shared/.
src/main/      Electron + Node adapters, windows, protocol, network guard, IPC handlers.
src/preload/   The only bridge: typed window.galeo API from a plain channel table.
src/renderer/  React chrome, Document Host, render worker. Talks only to window.galeo.
```

## Conventions (non-negotiable)

- **Justify choices on their own merits** (requirements, ADRs, measurements), not by pointing at
  other products.
- **Dependencies** must be well adopted, stable, maintained **and** substantially used.
  Otherwise write a small own module with tests. Every addition is vetted and recorded in
  [`docs/dependencies.md`](dependencies.md) before it's installed. Pin exact versions.
- **Security requirements SR-01…SR-17** (threat model) are acceptance criteria, not suggestions.
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
- **Docs placement**: PRD, ADRs and official docs go in `docs/`. Working notes stay out of the
  repo, and commit messages and code never reference private task IDs.
- **Commits**: Conventional Commits (enforced by commitlint).
- **Tests**: tests first for `core/` and security logic. Every bug fix gets a regression test.
  e2e tests wait on app events, never on sleeps.

## Change checklist

- [ ] `npm run check` is green (typecheck, import boundaries, tests)
- [ ] New behaviour has tests, including the failure branches
- [ ] No new dependency without a `docs/dependencies.md` entry
- [ ] Relevant SR-xx requirements still hold. Nothing loosens `webPreferences`, the CSP or the
      network guard
- [ ] Docs updated if behaviour or commands changed
- [ ] Commit messages are Conventional Commits
