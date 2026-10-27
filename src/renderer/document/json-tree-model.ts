// What the JSON tree view shows (ADR-018, UX F14), apart from drawing it: which nodes are expanded
// and so which rows are visible, each row's label, place among its siblings and source line, and
// the path that names it. Built on the worker's index; nothing here walks the document as objects.
import { keyOf, scalarText, typeOf, type JsonTree, type JsonType } from '../../shared/json-index';

interface RowParts {
  key: string | null;
  value: string;
  type: JsonType;
}

/** Strings longer than this show cut short in their row. */
const PREVIEW_CHARS = 200;

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const LF = 0x0a;
const CR = 0x0d;

export interface TreeModel {
  readonly nodes: number;
  /** The visible nodes, in order: the tree's rows. */
  rows(): Uint32Array;
  depth(node: number): number;
  expandable(node: number): boolean;
  isExpanded(node: number): boolean;
  toggle(node: number): void;
  expandAll(): void;
  /** Back to the top level. */
  collapseAll(): void;
  /** Expands the nodes above `node`, so it has a row. */
  reveal(node: number): void;
  parent(node: number): number;
  /** 1-based, among its siblings (`aria-posinset`). */
  positionInSet(node: number): number;
  /** Its siblings and itself (`aria-setsize`). */
  setSize(node: number): number;
  /**
   * The row's key (null in an array or at the top) and value, with the value's type. The value is previewed:
   * `{3 keys}`, `[2 items]`, a scalar as JSON writes it.
   */
  parts(node: number): RowParts;
  /** The path naming the node: `$.items[3].name`, `$["odd key"]`. */
  path(node: number): string;
  /** The node with this path, or null. */
  find(path: string): number | null;
  /** The 1-based source line the node starts on (its key, if it has one). */
  lineOf(node: number): number;
  /** The last node starting on or before `line`. */
  nodeAtLine(line: number): number;
  /** Expands the nodes that `previous` (an earlier version of the document) had expanded, by path. */
  keepExpanded(previous: TreeModel): void;
  /** The paths of the expanded nodes. */
  expandedPaths(): Set<string>;
}

/** Offsets where each line starts, line breaks counted as the source view counts them. */
function lineStarts(text: string): Uint32Array {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === LF || (c === CR && text.charCodeAt(i + 1) !== LF)) starts.push(i + 1);
  }
  return Uint32Array.from(starts);
}

/** How many of the sorted `values` are at most `value`. */
function countAtMost(values: Uint32Array, value: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle]! <= value) low = middle + 1;
    else high = middle;
  }
  return low;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function createTreeModel(text: string, tree: JsonTree): TreeModel {
  const { nodes, parents, ends, counts, places } = tree;
  const depths = new Uint16Array(nodes);
  const positions = new Uint32Array(nodes);
  const seen = new Uint32Array(nodes);
  for (let node = 1; node < nodes; node++) {
    const parent = parents[node]!;
    depths[node] = depths[parent]! + 1;
    positions[node] = ++seen[parent]!;
  }
  if (nodes > 0) positions[0] = 1;
  const expandable = (node: number) => counts[node]! > 0;
  const expanded = new Uint8Array(nodes);
  let rows: Uint32Array | null = null;
  let starts: Uint32Array | null = null;
  const changed = () => {
    rows = null;
  };
  const collapseAll = () => {
    expanded.fill(0);
    if (nodes > 0 && expandable(0)) expanded[0] = 1;
    changed();
  };
  collapseAll();

  /** Each node's path segment, appended to its parent's path. */
  const segment = (node: number): string => {
    const key = keyOf(text, tree, node);
    if (key === null) return `[${positions[node]! - 1}]`;
    return IDENTIFIER.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
  };

  /** Calls `visit` with every node's path, in one pass (parents' paths kept, not rebuilt). */
  const eachPath = (visit: (node: number, path: string) => boolean | void): void => {
    const paths: string[] = new Array(nodes);
    for (let node = 0; node < nodes; node++) {
      const path = node === 0 ? '$' : paths[parents[node]!]! + segment(node);
      if (expandable(node)) paths[node] = path;
      if (visit(node, path) === true) return;
    }
  };

  const model: TreeModel = {
    nodes,
    rows() {
      if (rows) return rows;
      const out = new Uint32Array(nodes);
      let count = 0;
      for (let node = 0; node < nodes; ) {
        out[count++] = node;
        node = expandable(node) && !expanded[node] ? ends[node]! : node + 1;
      }
      return (rows = out.subarray(0, count));
    },
    depth: (node) => depths[node]!,
    expandable,
    isExpanded: (node) => expanded[node] === 1,
    toggle(node) {
      if (!expandable(node)) return;
      expanded[node] = expanded[node] ? 0 : 1;
      changed();
    },
    expandAll() {
      for (let node = 0; node < nodes; node++) if (expandable(node)) expanded[node] = 1;
      changed();
    },
    collapseAll,
    reveal(node) {
      for (let up = parents[node]!; up !== -1; up = parents[up]!) expanded[up] = 1;
      changed();
    },
    parent: (node) => parents[node]!,
    positionInSet: (node) => positions[node]!,
    setSize: (node) => (node === 0 ? 1 : counts[parents[node]!]!),
    parts(node) {
      const type = typeOf(tree, node);
      let value: string;
      if (type === 'object') value = `{${plural(counts[node]!, 'key', 'keys')}}`;
      else if (type === 'array') value = `[${plural(counts[node]!, 'item', 'items')}]`;
      else if (type === 'string') {
        const full = scalarText(text, tree, node);
        const shown = JSON.stringify(full.length > PREVIEW_CHARS ? full.slice(0, PREVIEW_CHARS) : full);
        value = full.length > PREVIEW_CHARS ? `${shown.slice(0, -1)}…"` : shown;
      } else value = scalarText(text, tree, node);
      return { key: keyOf(text, tree, node), value, type };
    },
    path(node) {
      const segments: string[] = [];
      for (let at = node; at > 0; at = parents[at]!) segments.push(segment(at));
      return `$${segments.reverse().join('')}`;
    },
    find(path) {
      let found: number | null = null;
      eachPath((node, at) => {
        if (at !== path) return false;
        found = node;
        return true;
      });
      return found;
    },
    lineOf(node) {
      starts ??= lineStarts(text);
      return countAtMost(starts, places[node]!);
    },
    nodeAtLine(line) {
      starts ??= lineStarts(text);
      // Nodes start in rising order: the first one on the line, else the last one before it.
      const lineStart = line <= 1 ? 0 : line - 1 < starts.length ? starts[line - 1]! : Number.MAX_SAFE_INTEGER;
      const nextLine = line < starts.length ? starts[line]! : Number.MAX_SAFE_INTEGER;
      const before = lineStart === 0 ? 0 : countAtMost(places, lineStart - 1);
      if (before < nodes && places[before]! < nextLine) return before;
      return Math.max(0, before - 1);
    },
    expandedPaths() {
      const paths = new Set<string>();
      eachPath((node, path) => {
        if (expanded[node]) paths.add(path);
      });
      return paths;
    },
    keepExpanded(previous) {
      const paths = previous.expandedPaths();
      eachPath((node, path) => {
        if (expandable(node)) expanded[node] = paths.has(path) ? 1 : 0;
      });
      changed();
    },
  };
  return model;
}
