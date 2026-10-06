# ADR-011 — macOS and Windows CI and previews deferred until a stable Linux package

- Status: Accepted (2026-10-06)
- Date: 2026-10-06
- Deciders: project owner
- Supersedes: in [ADR-008](ADR-008-packaging-and-distribution.md), the macOS and Windows previews
  "built on CI runners for each OS"; and the PRD's "tested in CI on all three OSes; unsigned
  macOS/Windows preview builds are published". [ADR-007](ADR-007-platform-seam.md)'s portability
  rules stand.
- Related: [Releasing](../RELEASING.md), [Development](../development.md)

## Context

Linux is the only official platform. CI ran a macOS and a Windows job on every push as
non-blocking previews: unit tests, an end-to-end run and packaging. During v0.1 most of the time
spent on CI went to failures only those runners showed: timing differences, platform quirks in the
tests (crash reporting, file locking, key names) and slow new windows. None of it was a Linux
defect, and the owner has no macOS or Windows machine to check them on.

## Decision

Until galeo has a stable Linux package (v0.2 at the earliest), CI runs the Linux job only. The
macOS and Windows job stays in `.github/workflows/ci.yml`, switched off (`if: false`), and no
macOS or Windows previews are built or published. The code keeps ADR-007's portability rules (paths,
keys, platform adapters), but nothing checks them on those systems meanwhile.

## Consequences

- Faster, quieter CI; time goes to the Linux product.
- macOS and Windows support drifts unchecked: bringing it back means a round of fixes first.
  Known open item at the time of this decision: on the Windows runner a second window sometimes
  never became ready (two runs, `windows.spec` and `profiles.spec`), not investigated.

## Revisit triggers

- A stable Linux release in v0.2, or a user or contributor who needs macOS
  or Windows.
