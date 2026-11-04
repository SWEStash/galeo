# ADR-029 — A signed apt repository on the project's GitHub Pages site

- Status: Accepted (2026-11-04, owner)
- Date: 2026-11-04
- Deciders: project owner
- Supersedes: in [ADR-008](ADR-008-packaging-and-distribution.md), "an apt repository" in the "Not in v0.1"
  list, and the "Updates" bullet's "Users update by installing a new `.deb`/AppImage" for users of the `.deb`
  who add the repository. ADR-008's "no auto-updater and no update check" stands: galeo itself still never
  connects to the network.
- Related: [ADR-004](ADR-004-security-and-zero-network.md) (zero network),
  [ADR-017](ADR-017-release-workflow-with-attestations.md) (release workflow and attestations),
  [Threat model](../security/threat-model.md) (B8, SR-09, SR-10, T20, T21), [Releasing](../RELEASING.md)

## Context

Since 0.1, users update galeo by downloading each new `.deb` from GitHub Releases. Nothing tells them a release
exists, so SR-09's promise (a release within 7 days of a critical Electron fix) reaches only the users who watch
the repository. ADR-008 named "an apt repository later if there's demand" as the way out.

What shapes the choice:
- **galeo must stay offline.** An update check inside the app is ruled out (ADR-004). apt, run by the user, is
  the system's own updater, so a repository adds updates without galeo making any connection.
- **One maintainer, no servers.** Whatever hosts the repository must need no machine to run and no account
  beyond GitHub.
- **The release pipeline is already trusted.** Packages are built only in CI, with `SHA256SUMS` and GitHub
  artifact attestations (ADR-017). The repository should add a signature over that, not a new build.
- **Measured (2026-11-04).** GitHub Pages served the 0.5.0 `.deb` (107 MB) whole, with range requests and a
  10-minute cache. apt 3.2 on Ubuntu 26.04 accepted a repository signed with an ed25519 subkey, through both
  gpgv and Sequoia's sqv, and rejected a tampered index and a wrong key.

## Decision

1. **Where.** A flat Debian repository at `https://swestash.github.io/galeo/apt/`, one suite (`stable`), one
   component (`main`), amd64 only. It is published by the same Pages workflow as the website.
2. **What it holds.** The **latest published release's `.deb` only**. Every deploy rebuilds the repository
   from GitHub Releases, so nothing is kept between deploys. Older versions stay on GitHub Releases.
3. **When it changes.** When the owner publishes a release (drafts never trigger it), when the site changes,
   and by hand. A deploy that can't verify the `.deb` fails and leaves the live site as it was.
4. **Verified before signed.** A job with no secrets downloads the `.deb` and `SHA256SUMS`, checks the
   checksum and the attestation (built by this repository's release workflow), and builds the unsigned
   repository with `apt-ftparchive`. A second job, the only one with the signing key, runs no npm packages and
   no Actions besides GitHub's own, pinned. The key exists in one step, which signs `Release` (`InRelease` and
   `Release.gpg`) with gpg and deletes the keyring; the next step proves the result with an `apt-get update` and
   `apt-get download` against it. A third job deploys.
5. **The key.** An ed25519 OpenPGP key used only for this repository. Its primary key and revocation
   certificate stay **offline with the owner**. CI holds only a **signing subkey**, as a secret of the
   `github-pages` environment, which only `main` may deploy from.
6. **The key ships in the `.deb`.** The package installs the public key as
   `/opt/galeo/resources/galeo-archive-keyring.asc`, a file dpkg owns, and the user's sources entry names it in
   `Signed-By`. Because apt trusts only the key file on disk and never refreshes it, this is how a new subkey or
   a revocation reaches users: with the next upgrade. The repository is published only for a release whose
   `.deb` contains the key.
7. **Opt-in.** Users add the repository themselves: install a verified `.deb` once, then add one deb822
   `.sources` file. The package never adds the repository on its own: editing the system's sources from a
   post-install script is a trust decision the user should make. Users who don't add it see no change.
8. **Integrity details.** `Acquire-By-Hash: yes`, so a cached `InRelease` can never be paired with a newer
   `Packages`. No `Valid-Until`: it would need a scheduled re-sign, and the replay it guards against is
   accepted (T21).
9. **No new dependencies.** `apt-ftparchive`, `gpg` and `dpkg-deb` come with Ubuntu and the CI runner. The
   workflow reuses the Actions it already pins.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Own repository on GitHub Pages** | No server, no new account; the site already deploys from `main` through a protected environment; packages stay CI-built and attested | Pages limits (1 GB site, soft bandwidth cap); the signing key is a new secret to guard | **Chosen** |
| Hosted package service (Cloudsmith, packagecloud, Gemfury) | Less to run; managed signing | A third party holds the signing key or serves the packages; free tiers change; another account to secure | Rejected |
| Ubuntu PPA | Native to Ubuntu; Launchpad signs | Builds from source on Launchpad with no network: an Electron app with ~1,000 npm packages can't build there without vendoring everything | Rejected |
| Debian / Ubuntu archive | Discoverable; no setup for users | The same source-build rules, plus a sponsor and a policy-compliant source package; a long path for one maintainer | Rejected |
| A separate repository just for the apt files | Keeps big binaries out of the site's deploys | A second repository, a cross-repository token, two Pages setups | Rejected: revisit if the site's size limit is reached |
| Key downloaded by the user into `/etc/apt/keyrings` | No packaging change | apt never refreshes it, so every rotation or revocation needs every user to act | Rejected (owner, 2026-11-04) |
| Keep downloads only | Nothing new | Updates reach only users who watch releases; SR-09 stays half-delivered | Rejected |

## Consequences

### Positive
- `sudo apt update && sudo apt upgrade` brings each release to users who opted in, and SR-09's 7-day fixes reach
  them without watching GitHub.
- galeo itself still makes no connection: apt, run by the user, does the fetching.
- The repository adds a signature on top of the existing checks; it never builds anything.

### Negative
- A new secret to guard, and a key ceremony for the owner (generation, offline backup, revocation certificate).
- Users can set up the repository only from the first release whose `.deb` ships the key.
- Each Pages deploy downloads and re-signs the latest `.deb`, so site-only changes take a little longer.
- Removing galeo removes the key, so a sources file left behind makes `apt update` report a missing key until
  the user deletes it. The usage guide says so.

### Risks
- **The signing subkey leaks** (T20): anyone holding it can sign a package that apt installs as root for every
  user who opted in. Mitigation: the subkey lives only in the `github-pages` environment, the signing job runs
  no npm packages and holds the key in a single step, and [Releasing](../RELEASING.md) has a revocation and
  rotation runbook. A revocation reaches users with the next upgrade, which an attacker could race; the release
  notes then tell users to check the key.
- **Write access to `main`** is enough to change the workflow and sign anything. This is no new power: it can
  already change the release workflow. Mitigation: the same account protections as for releases.
- **Pages limits.** The site is capped at 1 GB and the repository holds one `.deb`, about 110 MB. Revisit if
  it grows or bandwidth warnings appear.

## Revisit triggers
- Users ask for older versions in the repository, or for arm64.
- Pages limits are reached, or GitHub changes them.
- The key is compromised, or a planned rotation is due.
- Official support for another Linux family (`.rpm`) or Flatpak is planned.
