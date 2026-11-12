# ADR-036 — `.rpm` packages and a dnf repository

- Status: Accepted (2026-11-12, owner)
- Date: 2026-11-12
- Deciders: project owner
- Supersedes: in [ADR-029](ADR-029-apt-repository-on-github-pages.md), "used only for this repository" in
  decision 5 (the key now also signs the dnf repository, through its own subkey). Builds on
  [ADR-008](ADR-008-packaging-and-distribution.md) (packaging), [ADR-017](ADR-017-release-workflow-with-attestations.md)
  (release workflow, attestations), [ADR-035](ADR-035-linux-arm64-packages.md) (arm64).
- Issue: [#54](https://github.com/SWEStash/galeo/issues/54)

## Context

galeo ships a `.deb` and an AppImage. Fedora and RHEL users get the AppImage only, with no updates through
their package manager. ADR-029 named `.rpm` as a reason to revisit its repository. There is no Fedora machine
for manual checks; Fedora containers run on both Linux runners.

The owner's calls (2026-11-12, #54): build it in v0.9 as a CI-checked preview, dnf only (no zypper), signed by
a new CI subkey of galeo's existing key.

## Decision

1. **What ships.** Every release carries an x64 and an arm64 `.rpm`, built on the same runners as the `.deb`
   (ADR-035), checked by `verify:package`, attested, and listed in `SHA256SUMS`: 14 packages. The `.rpm` is a
   **preview**, like the macOS and Windows builds: checked by CI, no manual checks, bugs welcome.
2. **What it installs.** The same as the `.deb` apart from AppArmor: the launcher wrapper, `galeo` and `gal`
   on `PATH`, the desktop entry, galeo's MIME types (MDX), the icon, and the public key (as decision 6 of
   ADR-029). Fedora allows Chromium's user-namespace sandbox without a profile, and SELinux's default policy
   doesn't block it: the spike checks both, and galeo starts with the sandbox on or not at all (ADR-009).
3. **The repository.** A dnf repository (rpm-md, `createrepo_c`) at `https://swestash.github.io/galeo/rpm/`, next
   to the apt one, rebuilt by the Pages workflow from the latest release, as in ADR-029 decisions 2–4: the
   packages are checked against `SHA256SUMS` and their attestation by a job with no secrets, signed by a job that
   runs no npm packages, and proven by a `dnf install` in a Fedora container before deploy. Users add one
   `.repo` file with `gpgcheck=1`, `repo_gpgcheck=1` and the key's URL.
4. **The key.** galeo's existing key gets a **new signing subkey for dnf**, made offline by the owner. CI holds it
   as a secret of two environments: the release's signing environment (packages, decision 5) and
   `github-pages` (repository metadata), beside the apt subkey there. A leak revokes that subkey only.
   The standby subkey of ADR-029 covers both. The published key file gains the subkey with the next release,
   which apt users receive with their upgrade.
5. **Where the packages are signed: in the release workflow, before attestation** (owner, 2026-11-12). One
   file everywhere: the release asset, `SHA256SUMS`, the attestation and the dnf repository all name the
   signed `.rpm`. A separate release job signs them: it runs after both Linux build jobs, runs no npm packages
   and no Actions besides GitHub's own, pinned, and reads the dnf subkey from a protected environment that
   only tags on `main` may use. The key exists in one step, which signs and deletes the keyring; the next step
   checks the signatures with `rpm -K` against the public key. Attestation and `SHA256SUMS` come after it. The
   Pages workflow signs only the repository's metadata (`repomd.xml.asc`), with the same subkey.
6. **How it's built.** electron-builder's `rpm` target, if the spike shows its `fpm` download is pinned and
   checked; otherwise `rpmbuild` with our own spec file. `rpm` and `createrepo-c` come from Ubuntu's archive on
   the runners; the install check uses the `fedora` container image, pinned by digest.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| `.rpm` + own dnf repository on Pages | Same model as apt: CI-built, attested, signed, no third party | A second repository to sign and check; a new subkey | **Chosen** (owner, 2026-11-12) |
| AppImage only (today) | No work | No updates through dnf; no desktop integration without Settings | Rejected |
| Fedora COPR | Fedora's own build service and hosting | Builds from a spec on Fedora's machines, not our attested CI; a new account | Rejected |
| Flatpak / Flathub | Reaches every distribution | A second sandbox model around Electron's; Flathub review and hosting; galeo's file access rules (ADR-004) need portals | Rejected for now |
| Sign the packages in the Pages job instead | The key stays in one environment, as for apt | The served `.rpm` differs from the attested release asset | Rejected (owner, 2026-11-12) |
| Sign only the repository metadata | One file, the key in Pages only | Fedora's tools warn about unsigned packages; a downloaded `.rpm` has only its attestation | Rejected (owner, 2026-11-12) |
| zypper (openSUSE) too | Same rpm-md repository | No openSUSE check in CI; the docs would promise what nobody tests | Not now (owner, 2026-11-12) |

## Consequences

- Two more packages per release to build, verify, attest and checksum; one more container check per
  architecture in the Pages workflow.
- A key ceremony for the owner (the new subkey), set as a secret in the release's signing environment and in
  `github-pages`; the release workflow gains a job that holds a key.
- RELEASING's revocation steps cover both subkeys.
- Fedora users get updates through `dnf upgrade`; the site's install tabs (#64) gain a dnf tab.
