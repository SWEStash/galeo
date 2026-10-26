// Reference check for the project's Markdown docs: relative links and their #anchors, ADR and SR ids,
// and repository paths written in code spans. Web links are never fetched. Heading anchors come from
// rehype-slug, which makes GitHub's slugs.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

const THREAT_MODEL = 'docs/security/threat-model.md';
const DECISIONS = 'docs/decisions';
/** Dated records describe the tree as it was, so their paths aren't checked. */
const DATED = 'docs/security/audits/';

const REPO_PATH = /^(?:src|tests|scripts|packaging|docs|build|assets|\.github)\//;
const PATTERN = /[*{<…\s]/;
const LINE_SUFFIX = /:\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/;
const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;

const parser = unified().use(remarkParse).use(remarkGfm);
const toHtml = unified().use(remarkRehype).use(rehypeSlug);

function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function docFiles(root) {
  const files = ['README.md', 'CONTRIBUTING.md'].filter((f) => existsSync(path.join(root, f)));
  const scan = (dir) => {
    if (!existsSync(path.join(root, dir))) return;
    for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) scan(rel);
      else if (entry.name.endsWith('.md')) files.push(rel);
    }
  };
  scan('docs');
  return files;
}

function lineAt(text, offset) {
  let line = 1;
  for (let i = 0; i < offset; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** Problems across the docs under `root`, each `{ file, line, message }`, in file and line order. */
export function checkDocs(root) {
  const files = docFiles(root);
  const parsed = new Map();
  const parse = (rel) => {
    if (!parsed.has(rel)) parsed.set(rel, parser.parse(readFileSync(path.join(root, rel), 'utf8')));
    return parsed.get(rel);
  };
  const anchors = new Map();
  const anchorsOf = (rel) => {
    if (!anchors.has(rel)) {
      const ids = new Set();
      walk(toHtml.runSync(parse(rel)), (n) => {
        if (n.type === 'element' && /^h[1-6]$/.test(n.tagName) && n.properties?.id) ids.add(String(n.properties.id));
      });
      anchors.set(rel, ids);
    }
    return anchors.get(rel);
  };

  const decisions = existsSync(path.join(root, DECISIONS)) ? readdirSync(path.join(root, DECISIONS)) : [];
  const hasDecision = (n) => decisions.some((f) => f.startsWith(`ADR-${n}-`) || f === `ADR-${n}.md`);
  const threatModel = existsSync(path.join(root, THREAT_MODEL)) ? readFileSync(path.join(root, THREAT_MODEL), 'utf8') : '';
  const requirements = new Set([...threatModel.matchAll(/\*\*SR-(\d+)\b/g)].map((m) => m[1]));

  const problems = [];
  for (const file of files) {
    const text = readFileSync(path.join(root, file), 'utf8');
    const report = (line, message) => problems.push({ file, line, message });

    walk(parse(file), (node) => {
      const line = node.position?.start.line ?? 0;
      if (node.type === 'link' || node.type === 'image' || node.type === 'definition') {
        const url = node.url ?? '';
        if (!url || EXTERNAL.test(url)) return;
        const hash = url.indexOf('#');
        const target = decodeURIComponent(hash < 0 ? url : url.slice(0, hash));
        const anchor = hash < 0 ? '' : decodeURIComponent(url.slice(hash + 1));
        const rel = target
          ? path.posix.normalize(target.startsWith('/') ? target.slice(1) : path.posix.join(path.posix.dirname(file), target))
          : file;
        if (!existsSync(path.join(root, rel))) report(line, `link to a missing file: ${url}`);
        else if (anchor && rel.endsWith('.md') && !anchorsOf(rel).has(anchor)) report(line, `link to a missing heading: ${url}`);
      } else if (node.type === 'inlineCode' && !file.startsWith(DATED)) {
        const value = node.value.trim();
        if (!REPO_PATH.test(value) || PATTERN.test(value)) return;
        const rel = value.replace(LINE_SUFFIX, '');
        if (!existsSync(path.join(root, rel))) report(line, `path not found: ${rel}`);
      }
    });

    for (const m of text.matchAll(/\bADR-(\d{3})\b/g)) {
      if (!hasDecision(m[1])) report(lineAt(text, m.index), `unknown decision record: ${m[0]}`);
    }
    for (const m of text.matchAll(/\bSR-(\d+)\b/g)) {
      if (!requirements.has(m[1])) report(lineAt(text, m.index), `unknown security requirement: ${m[0]}`);
    }
  }
  return problems.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
}

if (import.meta.main) {
  const root = path.resolve(process.argv[2] ?? '.');
  const problems = checkDocs(root);
  for (const p of problems) console.error(`${p.file}:${p.line} ${p.message}`);
  if (problems.length > 0) {
    console.error(`\n${problems.length} broken reference(s) in the docs`);
    process.exit(1);
  }
  console.log('Docs OK: links, anchors, ids and paths resolve');
}
