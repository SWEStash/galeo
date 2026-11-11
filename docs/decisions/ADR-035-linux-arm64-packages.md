# ADR-035 — Linux arm64 packages

- Status: Proposed (2026-11-10)
- Date: 2026-11-10
- Deciders: project owner
- Supersedes: in [ADR-008](ADR-008-packaging-and-distribution.md), "Linux arm64" in *Not in v0.1*; in
  [ADR-029](ADR-029-apt-repository-on-github-pages.md), "amd64 only" in point 1. Builds on
  [ADR-017](ADR-017-release-workflow-with-attestations.md) (release workflow, attestations).
- Issue: [#53](https://github.com/SWEStash/galeo/issues/53)

## Context

Releases carry macOS and Windows for x64 and arm64, but Linux for x64 only, so ARM laptops running Linux and
the Raspberry Pi 5 can't install galeo. ADR-008 left Linux arm64 out of v0.1, and ADR-029 named it as a
reason to revisit the apt repository.

GitHub's `ubuntu-24.04-arm` runner is free for public repositories. A trial run on it (2026-11-07) passed
everything the x64 release checks: typecheck, unit tests, the build and bundle check, the end-to-end suite,
the no-network harness, packaging, `verify:package` (fuses, AppArmor profile, launcher wrapper, icon, apt
key), `apt install` of the arm64 `.deb`, and the loaded AppArmor profiles. Its only failure was
`verify:package` looking for `linux-unpacked`, where arm64 builds go to `linux-arm64-unpacked`. That is fixed.

## Decision

1. **What ships.** Every release carries a `.deb` and an AppImage for arm64 beside the x64 ones, with the
   same support: the `.deb` is official, the AppImage secondary (ADR-008). The release has 12 packages.
2. **Where they're built.** The release workflow's Linux job runs once per architecture, each on its own
   runner (`ubuntu-24.04`, `ubuntu-24.04-arm`), with the same steps. Nothing is cross-built. Both jobs are
   read-only, and their packages count only when every job passed (ADR-017).
3. **Tests.** CI on `main` runs the end-to-end suite on x64 only. The arm64 release job runs it too, so no
   arm64 package is published untested. Adding arm64 to every push would double CI time for a build that,
   apart from the binary, is the same code.
4. **Names.** The AppImage names its architecture, as the `.deb` already does:
   `galeo-<version>-x86_64.AppImage` and `galeo-<version>-arm64.AppImage` (electron-builder's names). Up
   to 0.7.0 the AppImage was `galeo-<version>.AppImage`; links to that name break, and the 0.8.0 notes
   say so.
5. **apt.** The repository serves both from one suite (`binary-amd64`, `binary-arm64`, one signed
   `Release` listing `amd64 arm64`), all of one version. The Pages workflow checks every `.deb` against
   `SHA256SUMS` and its attestation before the signing job sees it. A release with only an amd64 `.deb`,
   as every one before 0.8.0, still publishes.
6. **Manual checks.** The owner's reference machine is x86_64, so the release's manual rows (VALIDATION)
   run there. arm64 relies on CI, plus an `apt install` from the published repository on an arm64 runner
   for each release that changes packaging.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Native build on the arm64 runner | Same steps as x64; the e2e suite and AppArmor check run on the real architecture | A second job (free for public repositories) | **Chosen** |
| Cross-build arm64 on the x64 runner | One job | Nothing would run the arm64 binary before release: no e2e, no sandbox check | Rejected |
| arm64 as an unsupported preview, like macOS and Windows | Lower bar | Linux is the official platform; the trial run passed every Linux check, so there's no reason to ship it labelled unsupported | Rejected |
| A second apt suite or repository for arm64 | Independent | Two sources files for users, two signatures; apt handles several architectures in one suite natively | Rejected |

## Consequences

- One more release job (about the length of the x64 one, plus the e2e suite), and two more files to attest
  and checksum.
- The apt setup snippet's `Architectures:` line names the user's architecture.
- The AppImage download link changes from 0.8.0.

## Revisit when

- GitHub stops offering free arm64 Linux runners for public repositories.
- An arm64-only failure shows up that CI on `main` would have caught: then arm64 joins CI on `main`.
