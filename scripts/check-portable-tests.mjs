// Portability check for tests, run on Linux before anything reaches the macOS and Windows jobs (ADR-027).
// It flags what passes on Linux but not there:
// - keys pressed as Control where macOS uses Cmd (`ControlOrMeta`), and Cmd+←/→, which moves by line on
//   macOS but by word elsewhere;
// - expected text holding a fixture path with `/`, which Windows shows with `\`;
// - GNU-only command-line tools, which macOS lacks.
// A line that decides per system (`process.platform`) or says `portable:` in a comment is left alone.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { listSourceFiles } from './lib/source-scan.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/** A key string given to `press`, `down` or `up`. */
const KEY = /\.(?:press|down|up)\(\s*(['"])([^'"]+)\1/g;
/** Control as a modifier on its own (not `ControlOrMeta`). Ctrl+Tab is Ctrl on macOS too. */
const BARE_CONTROL = /(?:^|\+)Control(?:\+|$)/;
const CTRL_TAB = /^(?:Shift\+)?Control\+(?:Shift\+)?Tab$/;
const CMD_ARROW = /(?:^|\+)ControlOrMeta(?:\+Shift)?\+Arrow(?:Left|Right)$|^Shift\+ControlOrMeta\+Arrow(?:Left|Right)$/;
/** Expected text or a pattern naming a fixtures folder with `/`. */
const FIXTURE_PATH = /\.(?:toContainText|toHaveText|toHaveAccessibleName|toHaveTitle)\([^)]*fixtures\/|\.(?:toContainText|toHaveText)\([^)]*fixtures\\\//;
/** GNU-only tools and options a test might shell out to. */
const GNU = /\b(?:execFileSync|execSync|spawnSync|execFile|spawn)\(\s*['"](?:touch|date|stat|sed|readlink|cp|find|xargs|timeout)['"]/;

const files = [...listSourceFiles(path.join(ROOT, 'tests')), ...listSourceFiles(path.join(ROOT, 'src'))].filter((file) => TEST_FILE.test(file));
const problems = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    const decided = /process\.platform|portable:/.test(line) || /process\.platform|portable:/.test(lines[index - 1] ?? '');
    if (decided) return;
    const at = `${path.relative(ROOT, file)}:${index + 1}`;
    for (const [, , key] of line.matchAll(KEY)) {
      if (BARE_CONTROL.test(key) && !CTRL_TAB.test(key)) problems.push(`${at}: '${key}' is Cmd on macOS: use ControlOrMeta, or choose per system`);
      if (CMD_ARROW.test(key)) problems.push(`${at}: '${key}' moves by line on macOS and by word elsewhere: choose per system`);
    }
    if (FIXTURE_PATH.test(line)) problems.push(`${at}: a fixture path with '/' is shown with '\\' on Windows: match [\\\\/]`);
    if (GNU.test(line)) problems.push(`${at}: a GNU tool's options differ on macOS: use Node's fs, or guard it`);
  });
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`✗ ${problem}`);
  console.error(`${problems.length} test line(s) that would fail on macOS or Windows (portable: <reason> to keep one)`);
  process.exit(1);
}
console.log(`Portable tests OK (${files.length} files)`);
