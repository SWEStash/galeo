// Fuzzy path matching for quick open: the query's letters in order anywhere in the path, scored
// so that letters in the file name, letters in a row and letters that start words rank first.
// The scoring follows the well-known fzy recurrence (optimal alignment by dynamic programming).

interface PathMatch {
  path: string;
  score: number;
  /** Indices in `path` of the matched letters, for highlighting. */
  positions: number[];
}

const GAP_LEADING = -0.005;
const GAP_TRAILING = -0.005;
const GAP_INNER = -0.01;
const CONSECUTIVE = 1.0;
const AFTER_SLASH = 0.9;
const AFTER_WORD = 0.8;
const CAPITAL = 0.7;
const AFTER_DOT = 0.6;
/** Extra for each letter matched in the file name rather than its folders. */
const IN_FILE_NAME = 0.5;
/** Longer paths are ranked, not aligned: nothing a person types into quick open needs more. */
const MAX_LENGTH = 1024;

function normalize(query: string): string {
  return query.replace(/\s+/g, '').toLowerCase();
}

/** Scratch space reused by every alignment: quick open scores many paths per keystroke. */
let bonus = new Float64Array(256);
let D = new Float64Array(256);
let M = new Float64Array(256);

/** Fills `bonus` with what a letter at each index is worth where it stands. */
function fillBonuses(path: string): void {
  const fileNameStart = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1;
  let previous = 47; // '/'
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i);
    let value = 0;
    if (previous === 47 || previous === 92) value = AFTER_SLASH;
    else if (previous === 45 || previous === 95 || previous === 32) value = AFTER_WORD;
    else if (previous === 46) value = AFTER_DOT;
    else if (char >= 65 && char <= 90 && previous >= 97 && previous <= 122) value = CAPITAL;
    bonus[i] = value + (i >= fileNameStart ? IN_FILE_NAME : 0);
    previous = char;
  }
}

function isSubsequence(needle: string, lower: string): boolean {
  let at = 0;
  for (let i = 0; i < lower.length && at < needle.length; i++) if (lower.charCodeAt(i) === needle.charCodeAt(at)) at++;
  return at === needle.length;
}

const consecutive = (j: number) => CONSECUTIVE + (bonus[j]! >= IN_FILE_NAME ? IN_FILE_NAME : 0);

/**
 * Scores `needle` (normalized) in `path` (`lower` is it lower-cased); with `trace`, also the
 * positions of the best alignment. D[i·n+j]: best score with needle[i] at path[j]; M[i·n+j]: best
 * score of needle[..i] within path[..j].
 */
function align(needle: string, path: string, lower: string, trace: boolean): { score: number; positions: number[] } {
  const n = path.length;
  const m = needle.length;
  if (bonus.length < n) bonus = new Float64Array(n * 2);
  if (D.length < n * m) {
    D = new Float64Array(n * m * 2);
    M = new Float64Array(n * m * 2);
  }
  fillBonuses(path);
  if (m === 1 && !trace) {
    const code = needle.charCodeAt(0);
    let best = -Infinity;
    for (let j = 0; j < n; j++) if (lower.charCodeAt(j) === code) best = Math.max(best, j * GAP_LEADING + bonus[j]! + (n - 1 - j) * GAP_TRAILING);
    return { score: best, positions: [] };
  }
  for (let i = 0; i < m; i++) {
    const row = i * n;
    const above = row - n;
    const code = needle.charCodeAt(i);
    let previousBest = -Infinity;
    const gap = i === m - 1 ? GAP_TRAILING : GAP_INNER;
    for (let j = 0; j < n; j++) {
      if (lower.charCodeAt(j) === code) {
        let score = -Infinity;
        if (i === 0) score = j * GAP_LEADING + bonus[j]!;
        else if (j > 0) score = Math.max(M[above + j - 1]! + bonus[j]!, D[above + j - 1]! + consecutive(j));
        D[row + j] = score;
        M[row + j] = previousBest = Math.max(score, previousBest + gap);
      } else {
        D[row + j] = -Infinity;
        M[row + j] = previousBest = previousBest + gap;
      }
    }
  }
  const score = M[m * n - 1]!;
  if (!trace) return { score, positions: [] };
  const positions: number[] = new Array(m);
  let matchRequired = false;
  for (let i = m - 1, j = n - 1; i >= 0; i--) {
    for (; j >= 0; j--) {
      const at = i * n + j;
      if (D[at] !== -Infinity && (matchRequired || D[at] === M[at])) {
        matchRequired = i > 0 && j > 0 && M[at] === D[at - n - 1]! + consecutive(j);
        positions[i] = j--;
        break;
      }
    }
  }
  return { score, positions };
}

/** Paths prepared once for many queries (the walk's result, while quick open is open). */
export interface PathIndex {
  paths: readonly string[];
  lower: readonly string[];
}

export function indexPaths(paths: readonly string[]): PathIndex {
  return { paths, lower: paths.map((path) => path.toLowerCase()) };
}

/** The match of `query` in `path`, or null when its letters aren't all there in order. */
export function matchPath(query: string, path: string): PathMatch | null {
  const needle = normalize(query);
  if (!needle) return { path, score: 0, positions: [] };
  const lower = path.toLowerCase();
  if (!isSubsequence(needle, lower)) return null;
  if (path.length > MAX_LENGTH) return { path, score: -Infinity, positions: [] };
  return { path, ...align(needle, path, lower, true) };
}

/**
 * The best `limit` matches of `query` among `paths`, best first; equal scores keep the shorter
 * path, then the given order. An empty query keeps the given order.
 */
export function topMatches(query: string, paths: readonly string[] | PathIndex, limit: number): PathMatch[] {
  const index = 'paths' in paths ? paths : indexPaths(paths);
  const needle = normalize(query);
  if (!needle) return index.paths.slice(0, limit).map((path) => ({ path, score: 0, positions: [] }));
  const best: { path: string; score: number; order: number }[] = [];
  const worse = (a: { path: string; score: number; order: number }, b: typeof a) =>
    a.score !== b.score ? a.score < b.score : a.path.length !== b.path.length ? a.path.length > b.path.length : a.order > b.order;
  for (let order = 0; order < index.paths.length; order++) {
    const lower = index.lower[order]!;
    if (!isSubsequence(needle, lower)) continue;
    const path = index.paths[order]!;
    const score = path.length > MAX_LENGTH ? -Infinity : align(needle, path, lower, false).score;
    const entry = { path, score, order };
    if (best.length === limit && !worse(best.at(-1)!, entry)) continue;
    let at = best.length;
    while (at > 0 && worse(best[at - 1]!, entry)) at--;
    best.splice(at, 0, entry);
    if (best.length > limit) best.pop();
  }
  return best.map(({ path }) => matchPath(query, path)!);
}
