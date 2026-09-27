// Verifies a packaged build in release/ (SR-08): the fuses read back from the binary match
// packaging/fuses.mjs, the check notices a flipped fuse, and the packaged app starts and parses
// its arguments. Playwright can't drive the packaged app: its fuses refuse --inspect.
import { FuseV1Options, FuseVersion, flipFuses, getCurrentFuseWire } from '@electron/fuses';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FUSES } from '../packaging/fuses.mjs';
import { fuseMismatches } from './lib/fuses.mjs';

const RELEASE = path.resolve(import.meta.dirname, '../release');

/** The binary that carries the fuses, and the entry point a user starts. */
function packagedApp() {
  if (process.platform === 'linux') {
    const dir = path.join(RELEASE, 'linux-unpacked');
    return { fuses: path.join(dir, 'galeo-bin'), entry: path.join(dir, 'galeo') };
  }
  if (process.platform === 'darwin') {
    const dir = readdirSync(RELEASE).find((name) => /^mac/.test(name));
    if (!dir) throw new Error('no macOS build in release/');
    const app = path.join(RELEASE, dir, 'galeo.app');
    return { fuses: app, entry: path.join(app, 'Contents', 'MacOS', 'galeo') };
  }
  const exe = path.join(RELEASE, 'win-unpacked', 'galeo.exe');
  return { fuses: exe, entry: exe };
}

const failures = [];
const { fuses, entry } = packagedApp();

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

// Smoke test: the packaged app runs its own code (from the asar) and rejects an unknown option.
const home = mkdtempSync(path.join(tmpdir(), 'galeo-smoke-'));
try {
  const result = spawnSync(entry, ['--bogus'], {
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      XDG_CONFIG_HOME: path.join(home, 'config'),
      XDG_STATE_HOME: path.join(home, 'state'),
      XDG_CACHE_HOME: path.join(home, 'cache'),
    },
  });
  if (result.status === 2 && result.stderr.includes('unknown option: --bogus')) {
    const relaunched = result.stderr.includes('setuid_sandbox_host');
    console.log(`smoke: packaged app rejects --bogus${relaunched ? ' (after the sandbox-unavailable relaunch)' : ''}`);
  } else {
    failures.push(`smoke: expected exit 2 and "unknown option", got ${result.status}: ${result.stderr.slice(-500)}`);
  }
} finally {
  rmSync(home, { recursive: true, force: true });
}

if (failures.length) {
  for (const failure of failures) console.error(`✗ ${failure}`);
  process.exit(1);
}
