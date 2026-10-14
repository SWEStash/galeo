# Releasing galeo

galeo ships as a `.deb` (official) and an AppImage on GitHub Releases
([ADR-008](decisions/ADR-008-packaging-and-distribution.md)); macOS and Windows previews are
deferred until a stable Linux package ([ADR-011](decisions/ADR-011-defer-macos-windows-ci.md)). There is no
auto-update: a new release is how fixes, Electron's included, reach users.

## Keeping Electron and dependencies current

- **Electron security releases** (SR-09, [threat model](security/threat-model.md)): a release
  that fixes a critical or high Chromium or V8 issue ships in a galeo release **within 7 days**.
  galeo never ships an Electron major that is out of support.
- **Dependabot** (`.github/dependabot.yml`) checks npm daily and GitHub Actions weekly. Electron,
  electron-builder and `@electron/*` come as one grouped PR with no waiting period; other updates
  wait 3 days after publication (a compromised release is usually caught by then), and development
  tooling is grouped. Runtime updates are committed as `fix(deps)`, tooling as `build(deps-dev)`.
- A PR is merged once CI is green (Linux only for now, ADR-011). Mermaid, KaTeX, DOMPurify and the sanitizer stay on
  exact versions; read their changelogs before taking an update
  ([dependencies](dependencies.md)).

## Release checklist

A tag starts the release workflow (`.github/workflows/release.yml`,
[ADR-017](decisions/ADR-017-release-workflow-with-attestations.md)). It builds the `.deb` and the
AppImage in CI, runs `verify:package` on them, writes `SHA256SUMS`, attests both packages, and
drafts a GitHub Release. Nothing built on a workstation is published. Before the tag:

1. **Green on this commit**: `npm run preflight` ends with "all green", and CI is green.
2. **Performance**: `GALEO_PERF=1 npm run build`, then `GALEO_PERF_ENFORCE=1 npm run headless -- npm run
   test:perf` on its own on the reference machine; the budgets hold and memory is within 10 % of
   the baseline. Record the numbers in [VALIDATION](VALIDATION.md).
3. **Manual checks** on the reference platform, installed from the `.deb` (`npm run package`,
   then `sudo apt install ./release/galeo_*.deb`): the keyboard-only and Orca passes and the
   desktop checks in [VALIDATION](VALIDATION.md), with their results recorded.
4. **Security review** against SR-01…SR-17 for anything that changed since the last release.
5. **Dry run** (optional, recommended after a workflow change): run the release workflow by hand
   from the Actions tab (*Run workflow* on `main`). It builds and attests, and drafts nothing.

Then cut it:

6. **Version**: semver from the commits since the last tag (`fix` → patch, `feat` → minor,
   a breaking change → major). Set it in `package.json`, commit `chore(release): <version>`, push,
   then tag `v<version>` on that commit and push the tag. The workflow refuses a tag that doesn't
   match `package.json` or isn't on `main`.
7. **Publish**: when the workflow is green, download the assets from the draft release and check
   them: `sha256sum -c SHA256SUMS` and
   `gh attestation verify galeo_<version>_amd64.deb --repo SWEStash/galeo` (the same for the
   AppImage). Edit the draft's notes (a list of commit subjects to start from) for readers, then
   publish it.
