# Releasing galeo

galeo ships as a `.deb` (official) and an AppImage on GitHub Releases
([ADR-008](decisions/ADR-008-packaging-and-distribution.md)), with unsigned macOS and Windows
previews beside them ([ADR-027](decisions/ADR-027-macos-windows-previews.md)). galeo has no
auto-update: a new release is how fixes, Electron's included, reach users. Users who added the apt
repository get it with `apt upgrade`; publishing a release updates the repository
([ADR-029](decisions/ADR-029-apt-repository-on-github-pages.md)).

## Keeping Electron and dependencies current

- **Electron security releases** (SR-09, [threat model](security/threat-model.md)): a release
  that fixes a critical or high Chromium or V8 issue ships in a galeo release **within 7 days**.
  galeo never ships an Electron major that is out of support.
- **Dependabot** (`.github/dependabot.yml`) checks npm daily and GitHub Actions weekly. Electron,
  electron-builder and `@electron/*` come as one grouped PR with no waiting period; other updates
  wait 3 days after publication (a compromised release is usually caught by then), and development
  tooling is grouped. Runtime updates are committed as `fix(deps)`, tooling as `build(deps-dev)`.
- A PR is merged once CI is green (Linux on `main`; macOS and Windows run in the Platforms workflow, ADR-027). Mermaid, KaTeX, DOMPurify and the sanitizer stay on
  exact versions; read their changelogs before taking an update
  ([dependencies](dependencies.md)).

## Release checklist

A tag starts the release workflow (`.github/workflows/release.yml`,
[ADR-017](decisions/ADR-017-release-workflow-with-attestations.md)). It builds the `.deb` and the
AppImage in CI, and, through the Platforms workflow, the macOS and Windows previews (`.dmg` and
`.zip`, setup and portable `.exe`, each for x64 and arm64;
[ADR-027](decisions/ADR-027-macos-windows-previews.md)) with their tests. It runs
`verify:package` on every package, and only when every job passed writes `SHA256SUMS`, attests all
ten packages and drafts a GitHub Release. Nothing built on a workstation is published.

Before the version commit, run the Platforms workflow once on the release candidate (push it to
`ci/platforms`, or `gh workflow run platforms.yml --ref main`), so the tag finds nothing new on
macOS or Windows. A run is long and its macOS jobs queue: one run per fix batch,
and `rerun_of=<run id>` runs only the end-to-end tests that failed. The previews get no manual
checks.

The version commit comes first, so every check below runs on the exact commit that gets tagged:

1. **Version**: semver from the commits since the last tag (`fix` → patch, `feat` → minor,
   a breaking change → major). Set it with `npm version <version> --no-git-tag-version` (it updates
   `package.json` and `package-lock.json`) and commit `chore(release): <version>`. Nothing else goes
   in this commit.
2. **Green on this commit**: `npm run preflight` ends with "all green"; push, and CI is green.
3. **Performance**: a [performance run](development.md#performance-runs) on the reference machine;
   the budgets hold and memory is within 10 % of the baseline.
4. **Manual checks** on the reference platform, installed from the `.deb` built from this commit
   (`npm run package`, then `sudo apt install ./release/galeo_*.deb`): the keyboard-only and Orca
   passes and the desktop checks in [VALIDATION](VALIDATION.md).
5. **Security review** against the threat model's SR requirements for anything that changed since
   the last release.
6. **Dry run** (optional, recommended after a workflow change): run the release workflow by hand
   from the Actions tab (*Run workflow* on `main`). It builds, tests and attests on every system,
   and drafts nothing; it takes as long as a full Platforms run.

If a check fails, fix it in a new commit (`main` takes no force-push, so the version commit
stays) and start again from step 2 on the fix: that commit is now the one that gets tagged.

Then cut it:

7. **Record**: the numbers from step 3 and the results of step 4 go in [VALIDATION](VALIDATION.md),
   committed *after* the checked commit and pushed, so the tag stays on the commit that was checked.
8. **Tag**: `v<version>` on the checked commit, then push the tag. The workflow refuses a tag that
   doesn't match `package.json` or isn't on `main`.
9. **Publish**: when the workflow is green, download the assets from the draft release and check
   them: `sha256sum -c SHA256SUMS` (all ten packages) and
   `gh attestation verify galeo_<version>_amd64.deb --repo SWEStash/galeo` (GitHub CLI 2.49 or
   later; the same for the AppImage and for one macOS and one Windows file). The notes end with the
   previews' Gatekeeper and SmartScreen steps. Edit the draft's notes (a list of commit subjects to start from) for readers, then
   publish it.
10. **Website**: if the UI changed visibly, retake the [website's screenshots](development.md#website)
    and commit them; the page links to the latest release, so nothing else changes.
11. **apt repository**: publishing starts the Pages workflow, which starts a second run on `main` (only
    `main` may deploy); that one checks the new `.deb` and signs the repository. When it is green, `sudo apt update && apt policy galeo` on the reference machine shows the
    new version as the candidate. If the release was published by a token rather than by hand, the
    workflow doesn't start: run it with `gh workflow run pages.yml --ref main`.

## The apt repository's key

The repository is signed by an ed25519 key made only for it
([ADR-029](decisions/ADR-029-apt-repository-on-github-pages.md)), fingerprint
`0240 8BDA 7C32 5856 C770 3ED4 716D B0EB 162F 5629`, made on 2026-11-04. Its signing subkeys: CI
`7161 D5E2 348F 3879 A762 784E 8D6C 14A4 7CC8 1C1B`, standby `1A6B F2CF BFDE 0021 55C1 6CC3 2422 FDA4 EBD5 5664`. Its primary key, a **standby** signing
subkey and the revocation certificate are on the owner's offline media; CI holds only the **CI** signing
subkey, as the `APT_SIGNING_KEY` secret of the `github-pages` environment. The public key is
`packaging/linux/galeo-archive-keyring.asc`: the Pages site serves it as `/apt/galeo.asc` for first setup, and
the `.deb` installs it as `/usr/share/keyrings/galeo-archive-keyring.asc`, the file users' sources entries name,
so a change to it reaches them with the next upgrade.

To work with the offline key: `export GNUPGHOME=<media>/galeo-apt-gnupg`.

**If the CI subkey leaks, or might have:**
1. Delete the secret at once: `gh secret delete APT_SIGNING_KEY --env github-pages --repo SWEStash/galeo`.
   The Pages workflow then fails at signing, and the live repository stays as it was.
2. With the offline key, revoke the CI subkey (`gpg --edit-key <fingerprint>`, then `key 1`, `revkey`,
   `save`), add a new signing subkey (`gpg --quick-add-key <fingerprint> ed25519 sign never`), and export the
   public key to `packaging/linux/galeo-archive-keyring.asc`.
3. Release a patch version carrying that key, and sign its repository **with the standby subkey**, which
   users already trust. For this one deploy, set `APT_SIGNING_KEY` to
   `gpg --armor --export-secret-subkeys '<standby subkey fingerprint>!'` and `APT_SIGNING_PASSPHRASE` to the
   offline key's passphrase (both with `gh secret set … --env github-pages --repo SWEStash/galeo`).
4. Once that deploy is green, delete `APT_SIGNING_PASSPHRASE`, set the new CI subkey as `APT_SIGNING_KEY`
   (exported without a passphrase, as in the first key procedure), and add a new standby subkey for the next
   time (its public key goes out with the next release).
5. Say in the release notes what happened, which subkey was revoked, and that users should upgrade now.

**If the primary key or both signing subkeys are lost or leak:** delete the secret, publish the revocation
certificate (`gpg --import <media>/galeo-apt-gnupg/openpgp-revocs.d/<fingerprint>.rev`, then export the public
key), and tell users in the release notes and on the website to remove the repository. A new key needs every
user to download it again, as on first setup.
