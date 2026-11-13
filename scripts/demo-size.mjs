// The website demo's size budget (#41): everything `npm run build:demo` writes to out/demo. Most of it loads only
// when a sample needs it (code grammars, diagram layouts, maths); the end-to-end test caps the first view.
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** The demo's whole size may grow to this before the check fails. */
export const DEMO_MAX_BYTES = 24 * 1000 * 1000;

/** Every file under `dir` with its size, largest first. */
export function demoFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const file = path.join(entry.parentPath, entry.name);
      return { file: path.relative(dir, file), bytes: statSync(file).size };
    })
    .sort((a, b) => b.bytes - a.bytes);
}

/** What breaks the budget: source maps (never published) and a total over `max`. */
export function demoSizeProblems(files, max = DEMO_MAX_BYTES) {
  const problems = files.filter(({ file }) => file.endsWith('.map')).map(({ file }) => `${file}: source maps aren't published`);
  const total = files.reduce((sum, { bytes }) => sum + bytes, 0);
  if (total > max) problems.push(`the demo is ${(total / 1e6).toFixed(1)} MB, over its ${(max / 1e6).toFixed(0)} MB budget`);
  return problems;
}

if (import.meta.main) {
  const dir = path.resolve(process.argv[2] ?? 'out/demo');
  let files;
  try {
    files = demoFiles(dir);
  } catch {
    console.error(`No demo in ${dir}: run \`npm run build:demo\` first.`);
    process.exit(1);
  }
  const total = files.reduce((sum, { bytes }) => sum + bytes, 0);
  console.log(`demo: ${(total / 1e6).toFixed(1)} MB in ${files.length} files (budget ${(DEMO_MAX_BYTES / 1e6).toFixed(0)} MB); largest:`);
  for (const { file, bytes } of files.slice(0, 5)) console.log(`  ${(bytes / 1e6).toFixed(2)} MB  ${file}`);
  const problems = demoSizeProblems(files);
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) process.exit(1);
  console.log('Demo size OK');
}
