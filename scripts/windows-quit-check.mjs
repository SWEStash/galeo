// Does a packaged galeo go away when the user closes it, on Windows (#46)? Starts the unpacked build
// with no test tool and no debugger attached, closes its window as a user would (WM_CLOSE, through
// taskkill without /F), and checks that every galeo process is gone within 10 s. Run in the Platforms
// workflow's Windows package jobs after `npm run package`. A process still there is reported, with
// its Chromium role, as a warning: the run finds out, the fix comes after.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describeProcesses, processesOf } from './lib/windows-processes.mjs';

const RUNS = 10;
const QUIT_MS = 10_000;
const START_MS = 60_000;

if (process.platform !== 'win32') {
  console.log('quit check: Windows only');
  process.exit(0);
}

const release = path.resolve(import.meta.dirname, '../release');
const exe = [path.join(release, 'win-unpacked', 'galeo.exe'), path.join(release, 'win-arm64-unpacked', 'galeo.exe')].find((file) => existsSync(file));
if (!exe) {
  console.error('quit check: no win-unpacked or win-arm64-unpacked galeo.exe; run npm run package first');
  process.exit(1);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const ours = () => processesOf([exe]);

/** Waits until `test` holds, checking every 250 ms; false when `ms` passed first. */
async function until(test, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (test()) return true;
    await sleep(250);
  }
  return test();
}

const dir = mkdtempSync(path.join(tmpdir(), 'galeo-quit-'));
const file = path.join(dir, 'notes.md');
writeFileSync(file, '# Notes\n');
const lingered = [];
try {
  for (let run = 1; run <= RUNS; run++) {
    const app = spawn(exe, ['--', file], { stdio: 'ignore' });
    // Up once a renderer runs: the window is there to close.
    if (!(await until(() => ours().some(({ commandLine }) => commandLine.includes('--type=renderer')), START_MS))) {
      console.error(`quit check: run ${run}: no window after ${START_MS / 1000} s`);
      spawnSync('taskkill', ['/pid', String(app.pid), '/T', '/F'], { stdio: 'ignore' });
      process.exitCode = 1;
      break;
    }
    const closing = Date.now();
    spawnSync('taskkill', ['/pid', String(app.pid)], { stdio: 'ignore' });
    const gone = await until(() => ours().length === 0, QUIT_MS);
    if (gone) console.log(`quit check: run ${run}: every process gone in ${Date.now() - closing} ms`);
    else {
      const left = describeProcesses(ours());
      lingered.push(`run ${run}: ${left}`);
      console.log(`::warning::galeo still running ${QUIT_MS / 1000} s after its window closed (run ${run}): ${left}`);
      spawnSync('taskkill', ['/pid', String(app.pid), '/T', '/F'], { stdio: 'ignore' });
      for (const { pid } of ours()) spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
      await until(() => ours().length === 0, QUIT_MS);
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`quit check: ${lingered.length} of ${RUNS} closes left a process behind${lingered.length ? `: ${lingered.join(' | ')}` : ''}`);
