# ADR-027 — macOS and Windows previews, tested on demand and at release

- Status: Accepted (2026-10-29, owner)
- Date: 2026-10-29
- Deciders: project owner
- Supersedes: [ADR-011](ADR-011-defer-macos-windows-ci.md); in
  [ADR-008](ADR-008-packaging-and-distribution.md), the macOS and Windows previews bullet. ADR-008's deferral of
  signed macOS and Windows releases stands, and so do [ADR-007](ADR-007-platform-seam.md)'s portability rules.
- Related: [ADR-017](ADR-017-release-workflow-with-attestations.md) (release workflow),
  [Releasing](../RELEASING.md), [Development](../development.md)

## Context

ADR-011 switched off the macOS and Windows CI job and the preview builds until galeo had a stable Linux package.
Linux releases have been stable since 0.2.0, and the owner now wants galeo on macOS and Windows.

Three facts shape how:
- **No machines.** The owner has neither a Mac nor a Windows PC. Apple's licence allows macOS virtual machines
  only on Apple hardware, so the owner's Linux laptop can't run one. A Windows virtual machine would work, but
  needs setting up and keeping licensed.
- **CI minutes are a quota.** GitHub Actions minutes for this repository come from a quota, and a macOS minute
  counts about ten Linux minutes, a Windows minute about two.
- **The runners were costly before.** In v0.1 most of the time spent on CI went to failures only the macOS and
  Windows runners showed: timing, platform quirks in the tests, slow new windows (ADR-011).

The code is mostly ready (ADR-007): the platform seam, Cmd on macOS, the macOS menu and app lifecycle, the title
bar, per-system data folders and the packaging config exist. What nothing checks is whether they still work.

## Decision

1. **Previews, not official support.** macOS and Windows builds are *previews*: unsigned and unsupported. The
   README, the usage guide and the release notes say so, and explain the macOS Gatekeeper and Windows SmartScreen
   warnings. Linux stays the only official platform, the only one with manual release checks.
2. **Formats.**
   - macOS: `.dmg` and `.zip`, for x64 and arm64.
   - Windows: an NSIS installer and a portable build, for x64 and arm64.
3. **Where they are tested.** The macOS and Windows CI jobs (unit, end-to-end, package, package check) run in
   three places only:
   - pushes to the `ci/platforms` branch, used to try platform fixes;
   - by hand (*Run workflow*);
   - the release workflow, where a failed macOS or Windows job stops the release.

   They never run on pushes to `main`. `main`'s required check stays "Linux (full)".
4. **Simulated platforms on every push.** Unit tests run the platform-dependent logic under Windows and macOS
   rules on Linux:
   - Windows paths;
   - case-insensitive file names;
   - the macOS key map;
   - each system's list of file types galeo won't hand to the default app.

   They are part of `npm test`, so they run in the preflight and on every push.
5. **Releases.** The release workflow builds the preview assets on their own systems, checks each package as it
   does the Linux ones (fuses included), and adds them to `SHA256SUMS` and the build attestations. Before the
   version commit, a `ci/platforms` run checks the release candidate.
6. **Fonts.** On macOS and Windows the font pickers offer the bundled fonts only; any installed family can still
   be typed by name.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Previews; macOS/Windows CI on demand and at release** | Few runs (fixes in batches, one gate per release); every release is checked on every platform | Platform bugs surface only on a `ci/platforms` run or at release, perhaps weeks after the change | **Chosen** |
| CI on every push to `main`, not blocking | Platform bugs show within a push | The most minutes (four platform jobs per push, macOS at ~10×); red runs on `main` | Rejected: quota |
| Weekly scheduled run plus the release gate | A bug surfaces within a week | Still about four runs a month when nothing changed | Rejected: quota |
| A local Windows virtual machine for checks before a push | Real Windows without CI minutes | Setup and licence upkeep; covers Windows only, macOS still needs CI | Rejected for previews |
| Official support on all three | macOS and Windows users get a supported app | Needs manual release checks on real macOS hardware every release | Rejected: no hardware |
| Signed and notarised builds | No Gatekeeper or SmartScreen warnings | Apple Developer ID (US$99 a year) and a Windows signing service; secrets in CI | Deferred (ADR-008) |

## Consequences

### Positive
- macOS and Windows users get galeo again, from the same release, with checksums and attestations.
- Every release is tested on all three systems, and the simulated tests catch most porting mistakes on every push
  without spending macOS or Windows minutes.

### Negative
- Between releases nothing runs on real macOS or Windows unless someone pushes to `ci/platforms`. A change can
  break them unnoticed until then.
- Previews get no manual checks: keyboard and screen-reader passes, Finder and Explorer integration and drags
  between windows are checked by automated tests only.
- Unsigned builds warn on first launch; some users won't get past that.

### Risks
- **A release blocked by a platform bug found late.** Mitigation: the `ci/platforms` run before the version
  commit, and the simulated tests.
- **The runners' quirks eat time again (ADR-011).** Mitigation: fixes are tried in batches on `ci/platforms`; a
  test that fails only through a runner quirk is skipped on that system with the reason recorded, never weakened.

## Revisit triggers
- A user or contributor on macOS or Windows who can run manual checks, or asks for official support.
- Signing becomes worth its cost.
- The minutes quota changes.
- A release fails on a platform bug that the simulated tests should have caught.
