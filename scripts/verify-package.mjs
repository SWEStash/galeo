// Verifies a packaged build in release/ (SR-08): the fuses read back from the binary match
// packaging/fuses.mjs, the check notices a flipped fuse, and the packaged app starts and parses
// its arguments. Playwright can't drive the packaged app: its fuses refuse --inspect.
import { FuseV1Options, FuseVersion, flipFuses, getCurrentFuseWire } from '@electron/fuses';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FUSES } from '../packaging/fuses.mjs';
import { fuseMismatches } from './lib/fuses.mjs';

const RELEASE = path.resolve(import.meta.dirname, '../release');

/** The binary that carries the fuses, the entry point a user starts, and the resources folder. */
function packagedApp() {
  if (process.platform === 'linux') {
    const dir = path.join(RELEASE, 'linux-unpacked');
    return { fuses: path.join(dir, 'galeo-bin'), entry: path.join(dir, 'galeo'), resources: path.join(dir, 'resources') };
  }
  if (process.platform === 'darwin') {
    const dir = readdirSync(RELEASE).find((name) => /^mac/.test(name));
    if (!dir) throw new Error('no macOS build in release/');
    const app = path.join(RELEASE, dir, 'galeo.app');
    return {
      fuses: app,
      entry: path.join(app, 'Contents', 'MacOS', 'galeo'),
      resources: path.join(app, 'Contents', 'Resources'),
    };
  }
  const dir = path.join(RELEASE, 'win-unpacked');
  return { fuses: path.join(dir, 'galeo.exe'), entry: path.join(dir, 'galeo.exe'), resources: path.join(dir, 'resources') };
}

const failures = [];
const { fuses, entry, resources } = packagedApp();

// A release bundle must not carry the performance harness hooks (builds made with GALEO_PERF=1).
if (readFileSync(path.join(resources, 'app.asar')).includes('GALEO_PERF_OUT')) {
  failures.push('bundle: built with GALEO_PERF=1 (perf hooks present); rebuild without it');
} else {
  console.log('bundle: no perf hooks');
}

// The .deb's AppArmor profile must grant user namespaces to the Electron binary itself, not to
// the wrapper in front of it (ADR-009).
if (process.platform === 'linux') {
  let profile = '';
  try {
    profile = readFileSync(path.join(resources, 'apparmor-profile'), 'utf8');
  } catch {
    failures.push('apparmor: no profile in the package (is the deb target built?)');
  }
  if (profile.includes('"/opt/galeo/galeo-bin"')) console.log('apparmor: profile names galeo-bin');
  else if (profile) failures.push('apparmor: the profile does not name /opt/galeo/galeo-bin');
}

const mismatches = fuseMismatches(await getCurrentFuseWire(fuses), FUSES);
if (mismatches.length) failures.push(...mismatches.map((m) => `fuses: ${m}`));
else console.log(`fuses: all ${Object.keys(FUSES).length} as expected in ${path.relative(RELEASE, fuses)}`);

// The check must notice a flipped fuse, on a copy of the binary.
const scratch = mkdtempSync(path.join(tmpdir(), 'galeo-fuses-'));
try {
  const copy = path.join(scratch, path.basename(fuses));
  cpSync(fuses, copy, { recursive: true, verbatimSymlinks: true });
  await flipFuses(copy, { version: FuseVersion.V1, [FuseV1Options.RunAsNode]: true });
  const flipped = fuseMismatches(await getCurrentFuseWire(copy), FUSES);
  if (flipped.includes('RunAsNode is enabled, expected disabled')) console.log('fuses: a flipped fuse is detected');
  else failures.push(`fuses: flipping RunAsNode went unnoticed (${JSON.stringify(flipped)})`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

// Smoke test: the packaged app runs its own code (from the asar). The arguments pass the Linux
// launcher's checks but not the app's, so the app itself must answer.
const home = mkdtempSync(path.join(tmpdir(), 'galeo-smoke-'));
try {
  const result = spawnSync(entry, ['--profile', 'a', '--profile', 'b'], {
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      XDG_CONFIG_HOME: path.join(home, 'config'),
      XDG_STATE_HOME: path.join(home, 'state'),
      XDG_CACHE_HOME: path.join(home, 'cache'),
    },
  });
  if (result.status === 2 && result.stderr.includes('galeo: --profile given twice')) {
    const relaunched = result.stderr.includes('setuid_sandbox_host');
    console.log(`smoke: the packaged app parsed its arguments${relaunched ? ' (after the sandbox-unavailable relaunch)' : ''}`);
  } else {
    failures.push(`smoke: expected exit 2 and "--profile given twice", got ${result.status}: ${result.stderr.slice(-500)}`);
  }
} finally {
  rmSync(home, { recursive: true, force: true });
}

if (failures.length) {
  for (const failure of failures) console.error(`✗ ${failure}`);
  process.exit(1);
}
