# Releasing galeo

galeo ships as a `.deb` (official) and an AppImage on GitHub Releases, with unsigned macOS and
Windows previews ([ADR-008](decisions/ADR-008-packaging-and-distribution.md)). There is no
auto-update: a new release is how fixes, Electron's included, reach users.

## Keeping Electron and dependencies current

- **Electron security releases** (SR-09, [threat model](security/threat-model.md)): a release
  that fixes a critical or high Chromium or V8 issue ships in a galeo release **within 7 days**.
  galeo never ships an Electron major that is out of support.
- **Dependabot** (`.github/dependabot.yml`) checks npm daily and GitHub Actions weekly. Electron,
  electron-builder and `@electron/*` come as one grouped PR with no waiting period; other updates
  wait 3 days after publication (a compromised release is usually caught by then), and development
  tooling is grouped. Runtime updates are committed as `fix(deps)`, tooling as `build(deps-dev)`.
- A PR is merged once CI is green on Linux; the macOS and Windows previews don't block, but a
  failure there is fixed in the next commit. Mermaid, KaTeX, DOMPurify and the sanitizer stay on
  exact versions; read their changelogs before taking an update
  ([dependencies](dependencies.md)).

## Release checklist

Releases are cut by hand from `main` for now.

1. **Green on this commit**: `npm run preflight` ends with "all green", and CI is green on Linux
   (macOS and Windows previews too, or their failures are understood).
2. **Performance**: `GALEO_PERF=1 npm run build`, then `GALEO_PERF_ENFORCE=1 npm run headless -- npm run
   test:perf` on its own on the reference machine; the budgets hold and memory is within 10 % of
   the baseline. Record the numbers in [VALIDATION](VALIDATION.md).
3. **Manual checks** on the reference platform, installed from the `.deb` (`npm run package`,
   then `sudo apt install ./release/galeo_*.deb`): the keyboard-only and Orca passes and the
   desktop checks in [VALIDATION](VALIDATION.md), with their results recorded.
4. **Security review** against SR-01…SR-17 for anything that changed since the last release.
5. **Version**: semver from the commits since the last tag (`fix` → patch, `feat` → minor,
   a breaking change → major). Set it in `package.json`, commit `chore(release): <version>`, tag
   `v<version>`.
6. **Packages**: `npm run package` and `npm run headless -- npm run verify:package` for that
   commit; publish the `.deb` and AppImage on a GitHub Release for the tag, with release notes
   written for readers from the commit subjects. The macOS and Windows previews need a build on
   those systems: CI builds and verifies them on every push but doesn't keep the packages yet.
