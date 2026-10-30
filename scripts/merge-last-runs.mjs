// Merges the end-to-end shards' lists of failed tests (Playwright's `.last-run.json`, kept by the
// Platforms workflow) into one, so `--last-failed` runs all of them; prints how many there are.
// Usage: node scripts/merge-last-runs.mjs <folder with the downloaded lists> <output file>
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [from, to] = process.argv.slice(2);
if (!from || !to) throw new Error('usage: merge-last-runs.mjs <folder> <output>');

/** Every `.last-run.json` under `dir`. */
function lists(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return lists(full);
    return entry.name === '.last-run.json' ? [full] : [];
  });
}

const failed = [...new Set(lists(from).flatMap((file) => JSON.parse(readFileSync(file, 'utf8')).failedTests ?? []))];
mkdirSync(path.dirname(to), { recursive: true });
writeFileSync(to, JSON.stringify({ status: failed.length > 0 ? 'failed' : 'passed', failedTests: failed }));
console.log(failed.length);
