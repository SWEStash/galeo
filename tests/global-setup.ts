import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PREFIX = 'galeo-run-';
const STALE_MS = 24 * 60 * 60 * 1000;

/**
 * Every temporary folder a test run makes goes into one folder for the run, removed when the run ends:
 * the test homes, the tests' own folders and the app's temp files, so no test can leave one behind
 * (on Linux /tmp is often in memory). The workers and the apps they start inherit the variables.
 * A run that was killed before its end is swept by a later run once it is a day old.
 */
export default function globalSetup(): () => void {
  const system = tmpdir();
  for (const name of readdirSync(system)) {
    const folder = path.join(system, name);
    if (name.startsWith(PREFIX) && Date.now() - statSync(folder).mtimeMs > STALE_MS) remove(folder);
  }
  const run = mkdtempSync(path.join(system, PREFIX));
  for (const name of ['TMPDIR', 'TMP', 'TEMP']) process.env[name] = run;
  return () => remove(run);
}

function remove(folder: string): void {
  try {
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  } catch (error) {
    // On Windows a killed app's child processes can hold files a while longer (see removeTempHome).
    console.warn(`left ${folder}: ${(error as Error).message}`);
  }
}
