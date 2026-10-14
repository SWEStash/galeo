# ADR-012 — Hand-run releases with checksums until the public repository

- Status: Superseded by [ADR-017](ADR-017-release-workflow-with-attestations.md) (2026-10-14)
- Date: 2026-10-07
- Deciders: project owner
- Supersedes: in [ADR-008](ADR-008-packaging-and-distribution.md), the "Releases" item
  (semantic-release on `main`, a CI release job, GitHub artifact attestations); and, until the
  revisit trigger below, SR-10's "Releases are built only in CI, and ship `SHA256SUMS` plus GitHub
  artifact attestations" ([threat model](../security/threat-model.md)).
- Related: [Releasing](../RELEASING.md), [Dependencies](../dependencies.md)

## Context

ADR-008 planned releases cut by semantic-release in a CI job that also writes `SHA256SUMS` and
build attestations. semantic-release was removed on 2026-09-29: its bundled `npm` carried an
`undici` advisory the audit gate refuses ([dependencies](../dependencies.md)). No release job was
written, so the pre-release security audit found SR-10's release clause unmet. v0.1 is published
from a private repository; the public repository comes at the end of v0.2, with its own history.

## Decision

- v0.1 releases are cut by hand on the reference machine, following the checklist in
  [Releasing](../RELEASING.md): green preflight and CI on the commit, the packaged `.deb` and
  AppImage verified (`verify:package`: fuses, notices, desktop entry), a `v<version>` tag.
- Each release ships a `SHA256SUMS` file for its packages, published with them.
- The release workflow (CI-built packages, `SHA256SUMS`, GitHub artifact attestations) is built
  for the public repository, where attestations name a repository readers can see. Its tooling is
  chosen then; the unused `.releaserc.json` is removed.

## Consequences

- Readers can check a download against `SHA256SUMS`, but nothing proves which commit and workflow
  built it: a package built on a compromised machine would carry valid checksums.
- The release checklist is a manual gate: a skipped step goes unnoticed unless the release notes
  record it.

## Revisit triggers

- The public repository (end of v0.2): the release workflow and attestations land before its
  first release, and SR-10's release clause applies in full again.
- Anyone other than the owner cutting a release.
