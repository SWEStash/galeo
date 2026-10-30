#!/bin/sh
# Runs CI's Linux job (.github/workflows/ci.yml) on this machine before a push, in the same order,
# then repeats the end-to-end specs changed since the upstream branch to catch flaky tests.
# PREFLIGHT_REPEAT sets how often each changed spec runs (default 5); a changed test helper repeats
# the whole suite PREFLIGHT_SUITE_REPEAT times instead (default 2). Linux only; needs xvfb, strace,
# and the dev sandbox profile (`sudo scripts/dev-sandbox-setup.sh`).
set -eu

cd "$(dirname -- "$0")/.."

step() { printf '\n=== preflight: %s\n' "$1"; }

step 'dependencies match the lockfile'
npm ls --all >/dev/null

step 'audit (fails on high severity)'
npm audit --audit-level=high

step 'typecheck'
npm run typecheck

step 'import boundaries'
npm run boundaries

step 'unneeded exports'
npm run check:exports

step 'docs references'
npm run check:docs

step 'tests portable to macOS and Windows'
npm run check:portable

step 'unit and renderer tests'
npm test

step 'build'
npm run build

step 'bundle check (heavy renderers load lazily)'
npm run check:bundle

step 'end-to-end tests'
npm run headless -- npm run test:e2e

base=$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || echo origin/main)
changed=$(git diff --name-only --diff-filter=AM "$base"...HEAD -- 'tests/e2e/*.spec.ts' 'tests/helpers/*')
specs=$(printf '%s\n' "$changed" | grep '^tests/e2e/.*\.spec\.ts$' || true)
repeat=${PREFLIGHT_REPEAT:-5}
# A changed helper can affect any spec, so the whole suite is repeated.
if printf '%s\n' "$changed" | grep -q '^tests/helpers/'; then
  specs=tests/e2e
  repeat=${PREFLIGHT_SUITE_REPEAT:-2}
fi
if [ -n "$specs" ]; then
  step "flake check: specs changed since $base, $repeat times each"
  # shellcheck disable=SC2086 # one argument per spec
  npm run headless -- npx playwright test --project=e2e --repeat-each="$repeat" $specs
fi

step 'no-network harness'
npm run headless -- npm run test:no-network

step 'performance smoke'
GALEO_PERF=1 npm run build
# CI's runner is faster than a busy desktop, where the 50 KB median sits near its limit. An
# over-limit median gets one more run; a second one is reported at the end instead of stopping the
# preflight. Compare its medians with the last ones recorded before pushing.
perf_warning=
npm run headless -- npm run test:perf || {
  step 'performance smoke, again'
  npm run headless -- npm run test:perf || perf_warning=1
}

step 'package'
npm run package

step 'verify the package'
npm run headless -- npm run verify:package

if [ -n "$perf_warning" ]; then
  printf '\n=== preflight: all green except the performance smoke, over its limit twice on this machine\n'
else
  printf '\n=== preflight: all green\n'
fi
