export interface FindHit {
  /** 1-based, counting `\r\n`, `\r` and `\n` as line breaks, as the source view does. */
  line: number;
  /** Up to 40 characters before the match on its line, whitespace collapsed. */
  before: string;
  /** The matched text as written. */
  match: string;
  /** Up to 40 characters after the match on its line, whitespace collapsed. */
  after: string;
}

export interface FindInTextResult {
  count: number;
  /** Counting stopped at `FIND_ALL_CAP`. */
  capped: boolean;
  /** The first `FIND_ALL_HITS` matches. */
  hits: FindHit[];
}

/** Why a tab wasn't searched: its file's state (UX §4), or its search overran the budget. */
export type FindAllSkip = 'missing' | 'no-permission' | 'not-a-file' | 'unreadable' | 'too-large' | 'binary' | 'too-slow';

export type FindAllTab = { id: string; found: FindInTextResult } | { id: string; skipped: FindAllSkip };

/** A window's search of its tabs (ADR-024): tabs with matches and tabs not searched, in tab order. */
export type FindAllResult = { kind: 'done'; tabs: FindAllTab[] } | { kind: 'superseded' };

/** The find bar's cap too: past it the count reads "10000+". */
const FIND_ALL_CAP = 10_000;
const FIND_ALL_HITS = 20;
/** Shorter queries match too much to be worth a search of every tab. */
export const FIND_ALL_MIN_CHARACTERS = 2;
const CONTEXT = 40;

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Literal matches of `query` in a tab's source text (ADR-024). */
export function findInText(text: string, query: string, { caseSensitive }: { caseSensitive: boolean }): FindInTextResult {
  const result: FindInTextResult = { count: 0, capped: false, hits: [] };
  if ([...query].length < FIND_ALL_MIN_CHARACTERS) return result;
  const pattern = new RegExp(escapeRegExp(query), caseSensitive ? 'gu' : 'giu');
  let line = 1;
  let lineStart = 0;
  for (let found = pattern.exec(text); found; found = pattern.exec(text)) {
    if (result.count === FIND_ALL_CAP) {
      result.capped = true;
      break;
    }
    result.count++;
    if (result.hits.length === FIND_ALL_HITS) continue;
    const at = found.index;
    for (let i = lineStart; i < at; i++) {
      const char = text[i];
      if (char !== '\n' && char !== '\r') continue;
      if (char === '\r' && text[i + 1] === '\n') i++;
      line++;
      lineStart = i + 1;
    }
    const end = at + found[0].length;
    result.hits.push({
      line,
      before: collapse(text.slice(wholeStart(text, Math.max(lineStart, at - CONTEXT)), at)),
      match: found[0],
      after: collapse(text.slice(end, wholeEnd(text, lineEndBefore(text, end, end + CONTEXT)))),
    });
  }
  return result;
}

/** The first line break in `text` from `from`, or `limit` if none comes before it. */
function lineEndBefore(text: string, from: number, limit: number): number {
  for (let i = from; i < limit && i < text.length; i++) if (text[i] === '\n' || text[i] === '\r') return i;
  return Math.min(limit, text.length);
}

/** Whether a slice at `index` would split a surrogate pair. */
function splits(text: string, index: number): boolean {
  const code = text.charCodeAt(index);
  return index > 0 && code >= 0xdc00 && code <= 0xdfff;
}

/** A slice start that keeps whole characters, dropping a cut one. */
function wholeStart(text: string, index: number): number {
  return splits(text, index) ? index + 1 : index;
}

/** A slice end that keeps whole characters, dropping a cut one. */
function wholeEnd(text: string, index: number): number {
  return splits(text, index) ? index - 1 : index;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ');
}

/** `findInText` as main's task worker runs it (ADR-024). */
export function findInTextTask(input: unknown): FindInTextResult {
  const { text, query, caseSensitive } = (input ?? {}) as { text?: unknown; query?: unknown; caseSensitive?: unknown };
  if (typeof text !== 'string' || typeof query !== 'string' || typeof caseSensitive !== 'boolean') throw new Error('findInText: bad input');
  return findInText(text, query, { caseSensitive });
}
