// The JSON reader behind the tree view (ADR-018). `JSON.parse` decides whether the text is JSON;
// an own scanner then indexes it, since `JSON.parse` gives no positions: per node, typed arrays of
// spans into the text, never objects built from its keys (so `__proto__` is only ever data). When
// `JSON.parse` refuses the text, the same scanner finds where: V8 names no position for most errors.

export type JsonType = 'object' | 'array' | 'string' | 'number' | 'true' | 'false' | 'null';

const TYPES: readonly JsonType[] = ['object', 'array', 'string', 'number', 'true', 'false', 'null'];
const OBJECT = 0;
const ARRAY = 1;
const STRING = 2;
const NUMBER = 3;

/** How much one tree may hold; past either, the document is too large for the tree. */
export interface JsonLimits {
  nodes: number;
  depth: number;
}

/** The starting values (ADR-018 "Limits"). */
export const JSON_LIMITS: JsonLimits = { nodes: 200_000, depth: 1_000 };

/** The nodes in document order: a node's children follow it, and its subtree ends at `ends[node]`. */
export interface JsonTree {
  nodes: number;
  /** Index into the JSON types. */
  types: Uint8Array;
  /** -1 for the root. */
  parents: Int32Array;
  /** The node just past this one's subtree: its next sibling, if it has one. */
  ends: Uint32Array;
  counts: Uint32Array;
  /** The value's span in the text. */
  starts: Uint32Array;
  stops: Uint32Array;
  /** The key's span, quotes included; both 0 for an array item or the root. */
  keyStarts: Uint32Array;
  keyStops: Uint32Array;
  /** Where the node begins in the source (its key, if it has one), rising in node order. */
  places: Uint32Array;
}

export type JsonParse =
  | { state: 'tree'; tree: JsonTree }
  /** `line` and `column` count from 1, as the source view does. */
  | { state: 'invalid'; message: string; line: number; column: number }
  | { state: 'too-large' };

const SPACE = 0x20;
const TAB = 0x09;
const LF = 0x0a;
const CR = 0x0d;
const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const COMMA = 0x2c;
const COLON = 0x3a;
const MINUS = 0x2d;
const PLUS = 0x2b;
const DOT = 0x2e;
const ZERO = 0x30;
const NINE = 0x39;
const OPEN_OBJECT = 0x7b;
const CLOSE_OBJECT = 0x7d;
const OPEN_ARRAY = 0x5b;
const CLOSE_ARRAY = 0x5d;
const LITERALS: Record<number, { word: string; type: number }> = {
  0x74: { word: 'true', type: 4 },
  0x66: { word: 'false', type: 5 },
  0x6e: { word: 'null', type: 6 },
};

const isDigit = (c: number) => c >= ZERO && c <= NINE;
const isHex = (c: number) => isDigit(c) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66);

type Scan = { state: 'tree'; tree: JsonTree } | { state: 'error'; at: number } | { state: 'too-large' };

/**
 * One strict, linear pass. `record: false` only checks the grammar (to find an error), with no
 * limits and nothing kept.
 */
function scan(text: string, limits: JsonLimits, record: boolean): Scan {
  const length = text.length;
  // No node is shorter than one character, so the text bounds the node count too.
  const room = record ? Math.min(limits.nodes, length) : 0;
  const types = new Uint8Array(room);
  const parents = new Int32Array(room);
  const ends = new Uint32Array(room);
  const counts = new Uint32Array(room);
  const starts = new Uint32Array(room);
  const stops = new Uint32Array(room);
  const keyStarts = new Uint32Array(room);
  const keyStops = new Uint32Array(room);
  const places = new Uint32Array(room);
  // The open containers: their node, and whether each is an object.
  const open: number[] = [];
  const inObject: boolean[] = [];
  let nodes = 0;
  let pos = 0;
  let keyStart = 0;
  let keyStop = 0;

  const skipSpace = () => {
    for (let c = text.charCodeAt(pos); c === SPACE || c === TAB || c === LF || c === CR; c = text.charCodeAt(++pos));
  };

  /** Moves past a string at `pos`; false where it breaks the grammar (left at `pos`). */
  const string = (): boolean => {
    if (text.charCodeAt(pos) !== QUOTE) return false;
    pos++;
    while (pos < length) {
      const c = text.charCodeAt(pos);
      if (c === QUOTE) {
        pos++;
        return true;
      }
      if (c < SPACE) return false;
      if (c === BACKSLASH) {
        const e = text.charCodeAt(++pos);
        if (e === 0x75) {
          for (let i = 1; i <= 4; i++) if (!isHex(text.charCodeAt(pos + i))) return ((pos += i), false);
          pos += 5;
          continue;
        }
        // " \ / b f n r t
        if (e !== QUOTE && e !== BACKSLASH && e !== 0x2f && e !== 0x62 && e !== 0x66 && e !== 0x6e && e !== 0x72 && e !== 0x74) return false;
      }
      pos++;
    }
    return false;
  };

  const digits = (): boolean => {
    if (!isDigit(text.charCodeAt(pos))) return false;
    while (isDigit(text.charCodeAt(pos))) pos++;
    return true;
  };

  const number = (): boolean => {
    if (text.charCodeAt(pos) === MINUS) pos++;
    if (text.charCodeAt(pos) === ZERO) pos++;
    else if (!digits()) return false;
    if (text.charCodeAt(pos) === DOT) {
      pos++;
      if (!digits()) return false;
    }
    const e = text.charCodeAt(pos);
    if (e === 0x65 || e === 0x45) {
      pos++;
      const sign = text.charCodeAt(pos);
      if (sign === PLUS || sign === MINUS) pos++;
      if (!digits()) return false;
    }
    return true;
  };

  /** A key and its colon, ready for the member's value; false where they break the grammar. */
  const member = (): boolean => {
    keyStart = pos;
    if (!string()) return false;
    keyStop = pos;
    skipSpace();
    if (text.charCodeAt(pos) !== COLON) return false;
    pos++;
    skipSpace();
    return true;
  };

  /** A new node starting at `pos`; -1 past the node cap. */
  const node = (type: number): number => {
    if (!record) return 0;
    if (nodes >= limits.nodes) return -1;
    const index = nodes++;
    const parent = open.length === 0 ? -1 : open[open.length - 1]!;
    types[index] = type;
    parents[index] = parent;
    starts[index] = pos;
    keyStarts[index] = keyStart;
    keyStops[index] = keyStop;
    places[index] = keyStop === 0 ? pos : keyStart;
    if (parent !== -1) counts[parent]!++;
    keyStart = keyStop = 0;
    return index;
  };

  skipSpace();
  for (;;) {
    // A value at `pos`.
    const c = text.charCodeAt(pos);
    if (c === OPEN_OBJECT || c === OPEN_ARRAY) {
      if (record && open.length >= limits.depth) return { state: 'too-large' };
      const index = node(c === OPEN_OBJECT ? OBJECT : ARRAY);
      if (index === -1) return { state: 'too-large' };
      open.push(index);
      inObject.push(c === OPEN_OBJECT);
      pos++;
      skipSpace();
      const close = text.charCodeAt(pos);
      if (close !== (c === OPEN_OBJECT ? CLOSE_OBJECT : CLOSE_ARRAY)) {
        if (c === OPEN_OBJECT && !member()) return { state: 'error', at: pos };
        continue;
      }
      // An empty container closes below, like any other.
    } else {
      const literal = LITERALS[c];
      const type = c === QUOTE ? STRING : literal ? literal.type : NUMBER;
      const index = node(type);
      if (index === -1) return { state: 'too-large' };
      if (literal) {
        for (let i = 0; i < literal.word.length; i++, pos++) if (text.charCodeAt(pos) !== literal.word.charCodeAt(i)) return { state: 'error', at: pos };
      } else if (!(type === STRING ? string() : number())) return { state: 'error', at: pos };
      if (record) {
        stops[index] = pos;
        ends[index] = index + 1;
      }
    }

    // After a value: a separator, the close of its container, or the end of the text.
    for (;;) {
      skipSpace();
      if (open.length === 0) {
        if (pos < length) return { state: 'error', at: pos };
        const tree = { nodes, types, parents, ends, counts, starts, stops, keyStarts, keyStops, places };
        return { state: 'tree', tree: record ? trimmed(tree) : tree };
      }
      const object = inObject[inObject.length - 1]!;
      const c = text.charCodeAt(pos);
      if (c === (object ? CLOSE_OBJECT : CLOSE_ARRAY)) {
        pos++;
        const index = open.pop()!;
        inObject.pop();
        if (record) {
          stops[index] = pos;
          ends[index] = nodes;
        }
        continue;
      }
      if (c !== COMMA) return { state: 'error', at: pos };
      pos++;
      skipSpace();
      if (object && !member()) return { state: 'error', at: pos };
      break;
    }
  }
}

/** The arrays cut to the nodes found, each in a buffer of its own (to cross from the worker). */
function trimmed(tree: JsonTree): JsonTree {
  const n = tree.nodes;
  return {
    nodes: n,
    types: tree.types.slice(0, n),
    parents: tree.parents.slice(0, n),
    ends: tree.ends.slice(0, n),
    counts: tree.counts.slice(0, n),
    starts: tree.starts.slice(0, n),
    stops: tree.stops.slice(0, n),
    keyStarts: tree.keyStarts.slice(0, n),
    keyStops: tree.keyStops.slice(0, n),
    places: tree.places.slice(0, n),
  };
}

/** The 1-based line and column of `offset`, line ends counted as the source view counts them. */
function lineAndColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    const c = text.charCodeAt(i);
    if (c === LF || (c === CR && text.charCodeAt(i + 1) !== LF)) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

export function indexJson(text: string, limits: JsonLimits = JSON_LIMITS): JsonParse {
  try {
    JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const found = scan(text, limits, false);
    // Should the two ever disagree, V8's position (when it names one) or the end of the text.
    const at = found.state === 'error' ? found.at : Number(/at position (\d+)/.exec(message)?.[1] ?? text.length);
    return { state: 'invalid', message, ...lineAndColumn(text, at) };
  }
  const found = scan(text, limits, true);
  if (found.state === 'error') return { state: 'invalid', message: 'Not valid JSON', ...lineAndColumn(text, found.at) };
  return found;
}

export function typeOf(tree: JsonTree, node: number): JsonType {
  return TYPES[tree.types[node]!]!;
}

/** A member's key, decoded; null for an array item or the root. */
export function keyOf(text: string, tree: JsonTree, node: number): string | null {
  const stop = tree.keyStops[node]!;
  return stop === 0 ? null : (JSON.parse(text.slice(tree.keyStarts[node], stop)) as string);
}

/** A scalar as shown: a string decoded, a number (however big or precise) or a literal as written. */
export function scalarText(text: string, tree: JsonTree, node: number): string {
  const raw = text.slice(tree.starts[node], tree.stops[node]);
  return tree.types[node] === STRING ? (JSON.parse(raw) as string) : raw;
}
