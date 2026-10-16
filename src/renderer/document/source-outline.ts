import { ensureSyntaxTree, language, syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { OutlineEntry } from '../worker/pipeline/render';

type Tree = ReturnType<typeof syntaxTree>;
type SyntaxNode = Tree['topNode'];

/** How long an outline may spend parsing the rest of a large file; past it, the outline covers what is parsed. */
const PARSE_BUDGET_MS = 50;

/** An entry for the line `position` is on; its id names the line, as there is no anchor in source. */
function entry(state: EditorState, depth: number, text: string, position: number): OutlineEntry {
  const line = state.doc.lineAt(position).number;
  return { depth, text, line, id: `line:${line}` };
}

const children = (node: SyntaxNode, names: readonly string[]) => {
  const found: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) if (names.includes(child.name)) found.push(child);
  return found;
};

/** A YAML stream's top-level keys, grouped by document when there are several (ADR-018). */
function yamlOutline(state: EditorState, tree: Tree): OutlineEntry[] {
  const documents = children(tree.topNode, ['Document']);
  const grouped = documents.length > 1;
  return documents.flatMap((document, index) => {
    const keys = children(document, ['BlockMapping', 'FlowMapping'])
      .flatMap((mapping) => children(mapping, ['Pair']))
      .flatMap((pair) => children(pair, ['Key']))
      .map((key) => entry(state, grouped ? 2 : 1, state.sliceDoc(key.from, key.to), key.from));
    return grouped ? [entry(state, 1, `Document ${index + 1}`, document.from), ...keys] : keys;
  });
}

/**
 * A TOML file's root keys and its tables (ADR-018). The grammar marks only tokens: a key is a
 * `propertyName` that starts a line, a table header an `atom` that starts one with `[` (values in a
 * multi-line array are atoms that start lines too, but never with `[`).
 */
function tomlOutline(state: EditorState, tree: Tree): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  let inTable = false;
  tree.iterate({
    enter(node) {
      if (node.name !== 'atom' && node.name !== 'propertyName') return;
      const line = state.doc.lineAt(node.from);
      if (node.from !== line.from + (line.text.length - line.text.trimStart().length)) return;
      const text = state.sliceDoc(node.from, node.to).trim();
      if (node.name === 'atom') {
        if (!text.startsWith('[')) return;
        inTable = true;
      } else if (inTable) return;
      entries.push(entry(state, 1, text, node.from));
    },
  });
  return entries;
}

const OUTLINES: Record<string, (state: EditorState, tree: Tree) => OutlineEntry[]> = { yaml: yamlOutline, toml: tomlOutline };

/** The outline of a YAML or TOML source, from its syntax tree; nothing for other languages. */
export function sourceOutline(state: EditorState): OutlineEntry[] {
  const name = state.facet(language)?.name;
  const outline = name && Object.hasOwn(OUTLINES, name) ? OUTLINES[name] : undefined;
  if (!outline) return [];
  return outline(state, ensureSyntaxTree(state, state.doc.length, PARSE_BUDGET_MS) ?? syntaxTree(state));
}
