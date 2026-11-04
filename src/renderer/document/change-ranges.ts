/** Where a new version of a text differs from the one the reader last looked at (ADR-030). */
export interface ChangedRanges {
  /** Lines changed or inserted, as 1-based inclusive `[from, to]` line ranges of the new text, in order. */
  changed: [number, number][];
  /** Lines of the new text before which whole lines were removed (one past the end: removed at the end). */
  removedAt: number[];
}

/** Bounds the diff's detailed work: past them it falls back to coarser (larger, never missing) changes. */
const DIFF_LIMITS = { scanLimit: 20_000, timeout: 50 };

/**
 * The diff is `@codemirror/merge`'s, loaded with the first document that needs it. It runs on whole
 * lines (each distinct line stands for one character), so a removed line is never read as an edit to
 * a neighbour that shares its letters. A text with more distinct lines than that has characters for
 * falls back to a diff of the characters.
 */
export async function changedRanges(base: string, text: string): Promise<ChangedRanges> {
  if (base === text) return { changed: [], removedAt: [] };
  const { diff } = await import('@codemirror/merge');
  const units = asLineUnits(base.split('\n'), text.split('\n'));
  return units ? byLines(diff(units.base, units.text, DIFF_LIMITS)) : byCharacters(base, text, diff(base, text, DIFF_LIMITS));
}

/** Characters for lines: everything below the surrogates, and above them up to the end of the plane. */
const UNIT_COUNT = 0xd800 + (0x10000 - 0xe000);
const unitChar = (index: number) => String.fromCharCode(index < 0xd800 ? index : index + 0x800);

function asLineUnits(baseLines: string[], textLines: string[]): { base: string; text: string } | null {
  const ids = new Map<string, string>();
  const encode = (lines: string[]) => {
    let out = '';
    for (const line of lines) {
      let unit = ids.get(line);
      if (unit === undefined) {
        if (ids.size === UNIT_COUNT) return null;
        unit = unitChar(ids.size);
        ids.set(line, unit);
      }
      out += unit;
    }
    return out;
  };
  const base = encode(baseLines);
  const text = base === null ? null : encode(textLines);
  return base === null || text === null ? null : { base, text };
}

/** Changes counted in lines (0-based, half-open) as ranges of 1-based lines. */
function byLines(changes: readonly { fromA: number; toA: number; fromB: number; toB: number }[]): ChangedRanges {
  const changed: [number, number][] = [];
  const removedAt = new Set<number>();
  for (const { fromA, toA, fromB, toB } of changes) {
    if (fromB < toB) changed.push([fromB + 1, toB]);
    else if (fromA < toA) removedAt.add(fromB + 1);
  }
  return { changed: merged(changed), removedAt: [...removedAt].sort((a, b) => a - b) };
}

function byCharacters(base: string, text: string, changes: readonly { fromA: number; toA: number; fromB: number; toB: number }[]): ChangedRanges {
  const lineOf = lineFinder(text);
  const changed: [number, number][] = [];
  const removedAt = new Set<number>();
  for (const { fromA, toA, fromB, toB } of changes) {
    if (fromB < toB) {
      // Text inserted after a line's end starts on the next line: the line it follows is unchanged.
      const from = text[fromB] === '\n' && (fromB === 0 || text[fromB - 1] !== '\n') ? fromB + 1 : fromB;
      changed.push([lineOf(Math.min(from, toB - 1)), lineOf(toB - 1)]);
    } else if (base.slice(fromA, toA).includes('\n') && (fromB === 0 || text[fromB - 1] === '\n')) {
      removedAt.add(lineOf(fromB));
    } else {
      changed.push([lineOf(fromB), lineOf(fromB)]);
    }
  }
  return { changed: merged(changed), removedAt: [...removedAt].sort((a, b) => a - b) };
}

/** A position's 1-based line in `text`; the position just past a final line break is the next line. */
function lineFinder(text: string): (at: number) => number {
  const starts = [0];
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) starts.push(at + 1);
  return (at) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (starts[middle]! <= at) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
}

/** Sorted ranges, with overlapping and touching ones joined. */
function merged(ranges: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [from, to] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const last = out.at(-1);
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  return out;
}
