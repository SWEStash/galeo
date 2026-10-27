// Source scanning shared by the static checks: no TypeScript API needed (TypeScript 7 has none).
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const SOURCE_FILE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/;

/** Every source file under `dir`, `node_modules` skipped; none if `dir` is missing. */
export function listSourceFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : listSourceFiles(full);
    return SOURCE_FILE.test(entry.name) ? [full] : [];
  });
}

/** A `/` after one of these (or at the start) begins a regex literal, not a division. */
const REGEX_PRECEDERS = new Set([
  '', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^',
]);

/** Index just past the regex literal starting at `start` (a `/`), honouring escapes and classes. */
function skipRegex(source, start) {
  let i = start + 1;
  let inClass = false;
  while (i < source.length && source[i] !== '\n') {
    const ch = source[i];
    if (ch === '\\') i++;
    else if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (ch === '/' && !inClass) return i + 1;
    i++;
  }
  return i;
}

/**
 * Replaces comments with spaces (keeping newlines, so offsets and line numbers still match).
 * Strings and regex literals are skipped so that `//` inside them isn't taken for a comment.
 */
export function stripComments(source) {
  let out = '';
  let i = 0;
  let previous = '';
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next !== '/' && next !== '*' && REGEX_PRECEDERS.has(previous)) {
      const end = skipRegex(source, i);
      out += source.slice(i, end);
      i = end;
      previous = '/';
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== ch && (ch === '`' || source[j] !== '\n')) {
        j += source[j] === '\\' ? 2 : 1;
      }
      out += source.slice(i, j + 1);
      i = j + 1;
      previous = ch;
    } else {
      out += ch;
      if (!/\s/.test(ch)) previous = ch;
      i++;
    }
  }
  return out;
}

const RESOLVE_SUFFIXES = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '/index.ts', '/index.tsx'];

/** Resolves a relative specifier to an existing file, TypeScript-style (`./a.js` may be `a.ts`). */
export function resolveRelative(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const bases = /\.[cm]?js$/.test(base) ? [base, base.replace(/\.([cm]?)js$/, '.$1ts')] : [base];
  for (const candidate of bases.flatMap((b) => RESOLVE_SUFFIXES.map((suffix) => b + suffix))) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}
