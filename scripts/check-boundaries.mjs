// Import-boundary check for the source layout in ADR-007. Scans import specifiers per folder of
// src/ (no TypeScript API needed) and reports every import that crosses a boundary.
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { listSourceFiles, resolveRelative, stripComments } from './lib/source-scan.mjs';

const FOLDERS = ['shared', 'core', 'main', 'preload', 'renderer'];

/** Folders each folder may import from (dependencies point inward). */
const ALLOWED_FOLDERS = {
  shared: ['shared'],
  core: ['shared', 'core'],
  main: ['shared', 'core', 'main'],
  preload: ['shared', 'preload'],
  renderer: ['shared', 'renderer'],
};

/** Folders that must stay free of Electron and Node APIs. */
const PLATFORM_FREE = new Set(['shared', 'core', 'renderer']);

/** Folders whose bundles must not contain zod: schemas run in main only (ADR-007, SR-11). */
const ZOD_FREE = new Set(['preload', 'renderer']);

const NODE_BUILTINS = new Set(builtinModules);

const STATIC_IMPORT = /\b(import|export)\s+(type\s+)?(?:[^'"`;]*?\s+from\s+)?(['"])([^'"\n]+)\3/g;
const CALL_IMPORT = /\b(?:import|require)\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g;

/** Every import specifier in `source`, with its line and whether it is `import type`. */
function findImports(source) {
  const code = stripComments(source);
  const lineAt = (index) => code.slice(0, index).split('\n').length;
  const imports = [];
  for (const m of code.matchAll(STATIC_IMPORT)) {
    imports.push({ specifier: m[4], line: lineAt(m.index), typeOnly: Boolean(m[2]) });
  }
  for (const m of code.matchAll(CALL_IMPORT)) {
    imports.push({ specifier: m[2], line: lineAt(m.index), typeOnly: false });
  }
  return imports.sort((a, b) => a.line - b.line);
}

function isPlatformModule(specifier) {
  return (
    specifier === 'electron' ||
    specifier.startsWith('electron/') ||
    specifier.startsWith('node:') ||
    NODE_BUILTINS.has(specifier) ||
    NODE_BUILTINS.has(specifier.split('/')[0])
  );
}

const isZod = (specifier) => specifier === 'zod' || specifier.startsWith('zod/');

function folderOf(srcDir, file) {
  const [folder] = path.relative(srcDir, file).split(path.sep);
  return FOLDERS.includes(folder) ? folder : null;
}

export function checkBoundaries(root) {
  const srcDir = path.join(root, 'src');
  const violations = [];
  const toRelative = (file) => path.relative(root, file).split(path.sep).join('/');

  const importCache = new Map();
  const importsOf = (file) => {
    if (!importCache.has(file)) importCache.set(file, findImports(readFileSync(file, 'utf8')));
    return importCache.get(file);
  };

  /** The value-import chain from `file` to zod, or null if zod is unreachable. */
  const zodChain = (file, seen = new Set()) => {
    if (seen.has(file)) return null;
    seen.add(file);
    for (const imp of importsOf(file)) {
      if (imp.typeOnly) continue;
      if (isZod(imp.specifier)) return [toRelative(file), 'zod'];
      if (!imp.specifier.startsWith('.')) continue;
      const target = resolveRelative(file, imp.specifier);
      const chain = target && zodChain(target, seen);
      if (chain) return [toRelative(file), ...chain];
    }
    return null;
  };

  for (const folder of FOLDERS) {
    for (const file of listSourceFiles(path.join(srcDir, folder))) {
      const relativeFile = toRelative(file);
      const report = (imp, message) =>
        violations.push({ file: relativeFile, line: imp.line, specifier: imp.specifier, message });

      for (const imp of importsOf(file)) {
        if (ZOD_FREE.has(folder) && !imp.typeOnly) {
          if (isZod(imp.specifier)) {
            report(imp, `src/${folder} must not import zod (schemas run in main only; use \`import type\`)`);
            continue;
          }
          const target = imp.specifier.startsWith('.') && resolveRelative(file, imp.specifier);
          const chain = target && zodChain(target);
          if (chain) {
            report(imp, `src/${folder} must not reach zod (use \`import type\`): ${chain.join(' → ')}`);
            continue;
          }
        }
        if (imp.specifier.startsWith('.')) {
          const target = folderOf(srcDir, path.resolve(path.dirname(file), imp.specifier));
          if (target && !ALLOWED_FOLDERS[folder].includes(target)) {
            report(imp, `src/${folder} must not import from src/${target}`);
          }
        } else if (PLATFORM_FREE.has(folder) && isPlatformModule(imp.specifier)) {
          report(imp, `src/${folder} must not import Electron or Node modules`);
        }
      }
    }
  }
  return violations;
}

if (import.meta.main) {
  const root = path.resolve(process.argv[2] ?? '.');
  const violations = checkBoundaries(root);
  for (const v of violations) console.error(`${v.file}:${v.line}: '${v.specifier}': ${v.message}`);
  if (violations.length > 0) {
    console.error(`\n${violations.length} import-boundary violation(s); see docs/decisions/ADR-007-platform-seam.md`);
    process.exit(1);
  }
  console.log('Import boundaries OK');
}
