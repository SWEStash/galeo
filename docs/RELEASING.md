# Releasing galeo

galeo ships as a `.deb` (official) and an AppImage on GitHub Releases, each for x64 and arm64
([ADR-008](decisions/ADR-008-packaging-and-distribution.md), [ADR-035](decisions/ADR-035-linux-arm64-packages.md)), with unsigned macOS and Windows
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
  tooling is grouped. Runtime updates are committed as `fix(deps)`, tooling as `build(deps-dev)`, GitHub
  Actions as `ci(deps)`. Electron is a devDependency but ships in the app, so its updates are `fix(deps)`
  whatever Dependabot's PR says.
- Each update is applied by hand on `main`, one commit each, and Dependabot's PR is closed
  ([development → How we work](development.md#how-we-work), *Pull requests*); the commit is kept once CI is green (Linux on
  `main`; macOS and Windows run in the Platforms workflow, ADR-027). Mermaid, KaTeX, DOMPurify and the
  sanitizer stay on exact versions; read their changelogs before taking an update
  ([dependencies](dependencies.md)).

## Release checklist

A tag starts the release workflow (`.github/workflows/release.yml`,
[ADR-017](decisions/ADR-017-release-workflow-with-attestations.md)). It builds the `.deb` and the
AppImage in CI, on an x64 and an arm64 runner (the arm64 one also runs the end-to-end tests), and, through the Platforms workflow, the macOS and Windows previews (`.dmg` and
`.zip`, setup and portable `.exe`, each for x64 and arm64;
[ADR-027](decisions/ADR-027-macos-windows-previews.md)) with their tests. It runs
`verify:package` on every package, and only when every job passed writes `SHA256SUMS`, attests all
14 packages and drafts a GitHub Release. Before that, one job signs the two `.rpm` files
([ADR-036](decisions/ADR-036-rpm-packages-and-dnf-repository.md)), so what is checksummed and attested is
the signed file. Nothing built on a workstation is published.

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
   them: `sha256sum -c SHA256SUMS` (all 14 packages) and
   `gh attestation verify galeo_<version>_amd64.deb --repo SWEStash/galeo` (GitHub CLI 2.49 or
   later; the same for the AppImage, one `.rpm`, and one macOS and one Windows file). The notes end with the
   previews' Gatekeeper and SmartScreen steps. Edit the draft's notes (a list of commit subjects to start from) for readers, then
   publish it. The version is now **released**.
10. **Website**: if the UI changed visibly, retake the [website's screenshots](development.md#website)
    and commit them; the page links to the latest release, so nothing else changes.
11. **apt and dnf repositories**: publishing starts the Pages workflow, which starts a second run on `main` (only
    `main` may deploy); that one checks the new `.deb` and `.rpm` files, signs both repositories and installs from
    the dnf one on x64 and arm64. When it is green, `sudo apt update && apt policy galeo` on the reference machine shows the
    new version as the candidate. The same run builds the live demo from the new tag (ADR-037): open
    <https://swestash.github.io/galeo/demo/> and check it shows the plan. If the release was published by a token
    rather than by hand, the workflow doesn't start: run it with `gh workflow run pages.yml --ref main`.
12. **Milestone**: move each issue still open in the release's milestone to the next milestone or to
    none, with a one-line comment saying why, then close the milestone.

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
   exported without a passphrase, and add a new standby subkey for the next time (its public key goes out
   with the next release). The export is made from a copy of the key in memory, never on the laptop's
   disk, the way the key was first made: the CI copy carries no passphrase, since one stored beside it in
   the same secret store would add nothing.
   ```sh
   RAM=$(mktemp -d -p /dev/shm) && chmod 700 "$RAM"
   cp -a /media/$USER/<stick>/galeo-apt-gnupg/. "$RAM" && export GNUPGHOME="$RAM"
   gpg --change-passphrase <fingerprint>      # in the copy only: enter the passphrase, then an empty one
   gpg --armor --export-secret-subkeys '<new CI subkey fingerprint>!' \
     | gh secret set APT_SIGNING_KEY --env github-pages --repo SWEStash/galeo
   gpgconf --kill all && rm -r -- "${RAM:?}" && unset GNUPGHOME
   ```
   The trailing `!` exports that subkey alone; the stick's key keeps its passphrase.
5. Say in the release notes what happened, which subkey was revoked, and that users should upgrade now.

## The dnf repository's subkey

The dnf repository and the `.rpm` files ([ADR-036](decisions/ADR-036-rpm-packages-and-dnf-repository.md)) are
signed by the same key, through a **dnf signing subkey** of its own: `E885 D09A 145C CACF F13D D8C5 096C C3E0 AA10 E5F7`, made on 2026-11-13.
CI holds it as the `DNF_SIGNING_KEY` secret of two environments: `rpm-signing`, read only by the release
workflow's *Sign the .rpm packages* job, and `github-pages`, read only by the Pages workflow's signing job (for
`repomd.xml`). The standby subkey above covers it too. The public key file carries it; the `.rpm` installs that
file as `/etc/pki/rpm-gpg/RPM-GPG-KEY-galeo`, the path users' `.repo` file names.

**Setting it up**, or again after it was removed:

1. Create the `rpm-signing` environment with its rule before any run references it: GitHub creates a referenced
   environment on the spot, with no rule.
   ```sh
   gh api -X PUT repos/SWEStash/galeo/environments/rpm-signing \
     -F 'deployment_branch_policy[protected_branches]=false' -F 'deployment_branch_policy[custom_branch_policies]=true'
   gh api -X POST repos/SWEStash/galeo/environments/rpm-signing/deployment-branch-policies -f name=main -f type=branch
   gh api -X POST repos/SWEStash/galeo/environments/rpm-signing/deployment-branch-policies -f name='v*' -f type=tag
   gh api repos/SWEStash/galeo/environments/rpm-signing/deployment-branch-policies --jq '.branch_policies[] | "\(.type) \(.name)"'
   ```
   The last command lists `branch main` and `tag v*`, and nothing else.
2. Add the subkey to the offline key, in a copy of it in memory, and keep the result on the stick. `<fingerprint>`
   is the primary key's: once `GNUPGHOME` points at the copy, `gpg --list-keys` prints it on the line under `pub`.
   ```sh
   RAM=$(mktemp -d -p /dev/shm) && chmod 700 "$RAM"
   cp -a /media/$USER/<stick>/galeo-apt-gnupg/. "$RAM" && export GNUPGHOME="$RAM"
   gpg --list-keys
   gpg --quick-add-key <fingerprint> ed25519 sign never
   gpg --list-keys --with-subkey-fingerprints <fingerprint>
   ```
   This lists three `[S]` subkeys: apt's CI and standby subkeys (above), and the new dnf subkey, dated today.
   That one's fingerprint is the `<dnf subkey fingerprint>` of step 3: record it at the top of this section.
   ```sh
   cp -a "$RAM"/. /media/$USER/<stick>/galeo-apt-gnupg/
   gpg --armor --export <fingerprint> > packaging/linux/galeo-archive-keyring.asc
   ```
3. Set the secret in both environments, exported without a passphrase from that copy only (the stick's key
   keeps its passphrase), then delete the copy:
   ```sh
   gpg --change-passphrase <fingerprint>      # in the copy only: enter the passphrase, then an empty one
   gpg --armor --export-secret-subkeys '<dnf subkey fingerprint>!' | gh secret set DNF_SIGNING_KEY --env rpm-signing --repo SWEStash/galeo
   gpg --armor --export-secret-subkeys '<dnf subkey fingerprint>!' | gh secret set DNF_SIGNING_KEY --env github-pages --repo SWEStash/galeo
   gpgconf --kill all && rm -r -- "${RAM:?}" && unset GNUPGHOME
   ```
4. Commit the public key file (the `.deb` and `.rpm` carry it to users with their next upgrade), push, and run the
   release workflow by hand on `main`: its *Sign the .rpm packages* job signs both files and checks them against
   the committed key.

**If the dnf subkey leaks, or might have:** as for the apt subkey, with these names.
1. Delete it from both environments at once: `gh secret delete DNF_SIGNING_KEY --env rpm-signing --repo SWEStash/galeo`
   and the same with `--env github-pages`. Releases and the Pages workflow then fail at signing; the live repository
   stays as it was.
2. With the offline key, revoke the dnf subkey and add a new one (apt step 2), and export the public key.
3. Release a patch version carrying that key, signed **with the standby subkey**: set it as `DNF_SIGNING_KEY` and
   the offline key's passphrase as `DNF_SIGNING_PASSPHRASE`, in both environments, for that release only.
4. Once its deploy is green, delete both `DNF_SIGNING_PASSPHRASE` secrets, set the new dnf subkey in both
   environments (step 3 above), and add a new standby subkey: the old one is now spent for apt too.
5. Say in the release notes what happened, which subkey was revoked, and that users should upgrade now.

**If the primary key or both signing subkeys are lost or leak:** delete the secrets (apt's and dnf's), publish the revocation
certificate (`gpg --import <media>/galeo-apt-gnupg/openpgp-revocs.d/<fingerprint>.rev`, then export the public
key), and tell users in the release notes and on the website to remove the repository. A new key needs every
user to download it again, as on first setup.
