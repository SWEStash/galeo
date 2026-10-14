# ADR-017 — Releases are built, checksummed and attested in CI

- Status: Accepted (2026-10-14, owner)
- Date: 2026-10-14
- Deciders: project owner
- Supersedes: [ADR-012](ADR-012-hand-run-releases-until-public.md) (hand-run releases until the
  public repository). Restores SR-10's release clause in full
  ([threat model](../security/threat-model.md)).
- Related: [ADR-008](ADR-008-packaging-and-distribution.md), [Releasing](../RELEASING.md),
  [Dependencies](../dependencies.md)

## Context

ADR-012 let releases be cut by hand on the maintainer's machine, with `SHA256SUMS`, until the
repository went public. Its revisit trigger was the public repository. Checksums show that a
download is the file that was published. They don't show which commit and which build produced
it, so a package built on a compromised machine would still carry valid checksums.

SR-10 asks for releases built only in CI, shipping `SHA256SUMS` and GitHub artifact attestations
(build provenance). With a public repository, readers can see the workflow and the commit that an
attestation names, so the attestation means something to them. GitHub's attestations need a
public repository on the free plans.

CI (`ci.yml`) already builds both packages and runs `verify:package` on every push to `main`, but
nothing it builds is published.

## Decision

A tag `v<version>` on a commit of `main` runs `.github/workflows/release.yml`, which has three
jobs, each with only the permissions it needs:

1. **Build** (`contents: read`): checks that the tag matches `package.json`'s version and that the
   commit is on `main`; then `npm ci`, the audit gate, typecheck, unit tests, `npm run package`,
   the bundle check and `verify:package` (fuses, notices, desktop entry, launcher); then
   `SHA256SUMS` for the `.deb` and the AppImage, and release notes from the commit subjects since
   the last tag. No dependency cache: a release installs from the lockfile alone.
2. **Attest** (`id-token: write`, `attestations: write`): re-checks the files against `SHA256SUMS`
   and attests both packages with `actions/attest-build-provenance`. It runs in its own job so
   that no dependency's install or build script ever runs where a signing token can be minted.
3. **Release** (`contents: write`, tag only): re-checks the files and drafts the GitHub Release
   with both packages and `SHA256SUMS`. The maintainer edits the notes and publishes the draft.

Running the workflow by hand (`workflow_dispatch`) is a dry run: it builds and attests, and drafts
nothing. In a private repository it stops after the build.

All Actions are GitHub's own, pinned by commit SHA, and kept current by Dependabot. The only
credential is the workflow's `GITHUB_TOKEN`. The manual checks in [Releasing](../RELEASING.md)
(preflight, the performance run, the manual and security checks) still come before the tag.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Tag-triggered workflow, three jobs, draft release** | Provenance for every package; least privilege per job; the maintainer still reviews the release before it is public | One more workflow; the packages pass between jobs as an artifact | **Chosen** |
| One job that builds, attests and releases | Simplest file | `id-token` and `contents: write` would be live while dependency scripts run, so a compromised dev dependency could sign or publish | Rejected |
| Keep hand-cut releases, add a signature with a maintainer key | No CI change | The key lives on the same machine that builds; readers must find and trust the key; SR-10 stays unmet | Rejected |
| semantic-release or release-please | Versions and notes from the commits | More tooling and permissions for one maintainer; semantic-release was removed because its bundled `npm` failed the audit gate (ADR-012) | Rejected |
| Publish the release directly (no draft) | One step fewer | No last look at the notes and assets before readers see them | Rejected for now |

## Consequences

### Positive
- Readers can check a package with `sha256sum -c SHA256SUMS` and prove its origin with
  `gh attestation verify <file> --repo SWEStash/galeo` ([usage guide](../USAGE.md#installation)).
- The packages that ship are the ones `verify:package` checked, built from the tagged commit.
- SR-10 holds in full again.

### Negative
- A release depends on GitHub Actions being available.
- The CI build differs from the maintainer's local build (runner image, fresh install). The
  release checklist's manual checks run on a local build of the same commit, and the workflow's
  `verify:package` covers the shipped files.
- In a private repository the workflow can't attest, so the first full run happens in the public
  repository, as a dry run before the first tag.

## Revisit triggers

- macOS or Windows packages become official (ADR-011): they join the build and the attestation.
- An apt repository or another channel is added.
- Someone other than the owner cuts releases: consider required reviewers on a release
  environment.
