// Bundle report: what each entry (the window, the render worker) loads before anything lazy, and
// a check that the heavy renderers stay out of it (ADR-003: each loads with the first document that
// needs it). Reads the chunk records the renderer build writes to out/bundle/ (build/bundle-graph.ts).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Packages no entry may load up front. */
const LAZY_PACKAGES = ['katex', 'rehype-katex', 'shiki', '@shikijs/*', '@codemirror/*', 'mermaid', '@mermaid-js/*', 'dompurify'];

/** The package a module id belongs to (its last `node_modules/` segment), or null for own code. */
function packageOf(id) {
  const at = id.lastIndexOf('node_modules/');
  if (at < 0) return null;
  const [first, second] = id.slice(at + 'node_modules/'.length).split('/');
  return first.startsWith('@') ? `${first}/${second}` : first;
}

function isLazyPackage(pkg) {
  return LAZY_PACKAGES.some((name) => (name.endsWith('/*') ? pkg.startsWith(name.slice(0, -1)) : pkg === name));
}

/** Each entry chunk with the chunks it imports statically, transitively, in load order. */
function entryClosures(chunks) {
  const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  return chunks
    .filter((chunk) => chunk.isEntry)
    .map((entry) => {
      const seen = [];
      const visit = (fileName) => {
        const chunk = byFile.get(fileName);
        if (!chunk || seen.includes(chunk)) return;
        seen.push(chunk);
        chunk.imports.forEach(visit);
      };
      visit(entry.fileName);
      return { entry: entry.fileName, chunks: seen };
    });
}

/** Every lazy-only package an entry loads up front, once per entry. */
export function lazyViolations(chunks) {
  return entryClosures(chunks).flatMap(({ entry, chunks: loaded }) => {
    const found = new Map();
    for (const chunk of loaded) {
      for (const { id } of chunk.modules) {
        const pkg = packageOf(id);
        if (pkg && isLazyPackage(pkg) && !found.has(pkg)) found.set(pkg, { entry, chunk: chunk.fileName, pkg });
      }
    }
    return [...found.values()];
  });
}

/** What each entry loads up front, in rendered bytes. */
export function entryReports(chunks) {
  return entryClosures(chunks).map(({ entry, chunks: loaded }) => ({
    entry,
    chunks: loaded.map((chunk) => chunk.fileName),
    bytes: loaded.reduce((sum, chunk) => sum + chunk.modules.reduce((total, module) => total + module.bytes, 0), 0),
  }));
}

if (import.meta.main) {
  const dir = path.resolve(process.argv[2] ?? 'out/bundle');
  let files;
  try {
    files = readdirSync(dir).filter((file) => file.endsWith('.json'));
  } catch {
    files = [];
  }
  if (files.length === 0) {
    console.error(`No chunk records in ${dir}: run \`npm run build\` first.`);
    process.exit(1);
  }
  const chunks = files.flatMap((file) => JSON.parse(readFileSync(path.join(dir, file), 'utf8')));
  for (const report of entryReports(chunks)) {
    console.log(`${report.entry}: ${(report.bytes / 1024).toFixed(0)} KiB up front in ${report.chunks.length} chunk(s)`);
  }
  const violations = lazyViolations(chunks);
  for (const v of violations) console.error(`${v.entry} loads ${v.pkg} up front (in ${v.chunk}); it must load lazily`);
  if (violations.length > 0) process.exit(1);
  console.log('Bundle OK: heavy renderers load lazily');
}
