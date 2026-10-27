// Unused-export check for src/. An export that no other file imports should not be exported: drop the
// keyword if its own file uses it, or the code if nothing does. Exports only tests import are allowed.
// Scans import and export statements (no TypeScript API needed), like check-boundaries.mjs.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { listSourceFiles, resolveRelative, stripComments } from './lib/source-scan.mjs';

/** Folders whose files may import from src/. */
const CONSUMERS = ['src', 'tests', 'scripts', 'build'];
const TEST_FILE = /\.test\.[cm]?[jt]sx?$|\.spec\.[jt]sx?$/;
const ROOT_CONFIG = /^[\w.-]+\.config\.[cm]?[jt]s$/;

/** `export function f`, `export const x`, `export interface I`, `export class C` … (not `export default`). */
const DECLARATION = /\bexport\s+(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\*?|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
/** `export { a, b as c }` without `from`: names declared in this file. */
const LOCAL_LIST = /\bexport\s+(?:type\s+)?\{([^}]*)\}(?!\s*from)/g;
/** `import … from 'x'` and `export … from 'x'`, with the clause between. */
const FROM = /\b(import|export)\s+(?:type\s+)?([^'"`;]*?)\s+from\s+(['"])([^'"\n]+)\3/g;
/** `import('x')`, `require('x')`: every export counts as used. */
const CALL = /\b(?:import|require)\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g;

const lineAt = (code, index) => code.slice(0, index).split('\n').length;

/** The names in `{ a, type b, c as d }`: on the left of `as` (`c`), or on its right (`d`). */
function listedNames(list, side = 'left') {
  return list
    .split(',')
    .map((item) => item.trim().replace(/^type\s+/, ''))
    .filter(Boolean)
    .map((item) => {
      const [left, right = left] = item.split(/\s+as\s+/);
      return (side === 'left' ? left : right).trim();
    });
}

/** What `clause` (between `import`/`export` and `from`) takes from the module: names, or '*' for all. */
function takenNames(kind, clause) {
  if (/(?:^|,)\s*\*/.test(clause)) return '*';
  const braces = clause.match(/\{([^}]*)\}/);
  const names = braces ? listedNames(braces[1]) : [];
  const beforeBraces = clause.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim();
  if (kind === 'import' && beforeBraces) names.push('default');
  return names;
}

function exportsOf(code) {
  const found = [];
  for (const m of code.matchAll(DECLARATION)) found.push({ name: m[1], line: lineAt(code, m.index) });
  for (const m of code.matchAll(LOCAL_LIST)) {
    for (const name of listedNames(m[1], 'right')) found.push({ name, line: lineAt(code, m.index) });
  }
  return found;
}

export function checkExports(root) {
  const toRelative = (file) => path.relative(root, file).split(path.sep).join('/');
  const rootConfigs = listSourceFiles(root).filter((file) => path.dirname(file) === root && ROOT_CONFIG.test(path.basename(file)));
  const consumers = [...CONSUMERS.flatMap((folder) => listSourceFiles(path.join(root, folder))), ...rootConfigs];
  const testsDir = path.join(root, 'tests') + path.sep;

  /** file → name → 'src' (code imports it) | 'test' (only tests do); '*' stands for every name. */
  const used = new Map();
  const use = (file, name, by) => {
    const names = used.get(file) ?? new Map();
    if (names.get(name) !== 'src') names.set(name, by);
    used.set(file, names);
  };

  for (const file of consumers) {
    const code = stripComments(readFileSync(file, 'utf8'));
    const by = TEST_FILE.test(file) || file.startsWith(testsDir) ? 'test' : 'src';
    const take = (specifier, names) => {
      if (!specifier.startsWith('.')) return;
      const target = resolveRelative(file, specifier.replace(/\?.*$/, ''));
      if (!target || target === file) return;
      for (const name of names === '*' ? ['*'] : names) use(target, name, by);
    };
    for (const m of code.matchAll(FROM)) take(m[4], takenNames(m[1], m[2]));
    for (const m of code.matchAll(CALL)) take(m[2], '*');
  }

  const unused = [];
  for (const file of listSourceFiles(path.join(root, 'src'))) {
    if (TEST_FILE.test(file) || file.endsWith('.d.ts')) continue;
    const names = used.get(file) ?? new Map();
    if (names.has('*')) continue;
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const { name, line } of exportsOf(code)) {
      if (names.has(name)) continue;
      // A member access (`.name`) is another thing's name; a spread (`...name`) is a use.
      const ownUses = code.match(new RegExp(`(?<![\\w$])(?<![^.]\\.)${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g')).length;
      unused.push({ file: toRelative(file), line, name, usedInFile: ownUses > 1 });
    }
  }
  return unused.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

if (import.meta.main) {
  const unused = checkExports(path.resolve(process.argv[2] ?? '.'));
  for (const u of unused) {
    console.error(`${u.file}:${u.line}: '${u.name}' is exported but no other file imports it${u.usedInFile ? ' (drop `export`)' : ' (unused)'}`);
  }
  if (unused.length > 0) {
    console.error(`\n${unused.length} unneeded export(s)`);
    process.exit(1);
  }
  console.log('Exports OK');
}
