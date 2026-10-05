/**
 * Documents built to be expensive (SR-14), generated at test time rather than committed. Each
 * must end, within the render budget, as a rendered document or as source with a banner, never
 * as a hang.
 */
export const PATHOLOGICAL: Readonly<Record<string, () => string>> = {
  // The parser's work grows much faster than the text: 400 levels already take seconds.
  'nested-lists.md': () => Array.from({ length: 2000 }, (_, level) => `${'  '.repeat(level)}- item`).join('\n'),
  // Deep enough to exhaust the stack.
  'nested-quotes.md': () => `${'>'.repeat(10_000)} deep\n`,
  'emphasis.md': () => '*a **a '.repeat(100_000),
  'brackets.md': () => `${'['.repeat(100_000)}x${'](' .repeat(1000)}`,
  'reference-links.md': () =>
    `${Array.from({ length: 50_000 }, (_, n) => `[l${n}]: /x${n}`).join('\n')}\n\n${'[l1] '.repeat(50_000)}\n`,
  'table.md': () => `| a | b | c |\n|---|---|---|\n${'| 1 | `two` | **3** |\n'.repeat(10_000)}`,
  'math-bomb.md': () => `$${'\\left('.repeat(3000)}x${'\\right)'.repeat(3000)}$\n`,
  // Just under the edge limit, every node linked to the next ten.
  'diagram-bomb.md': () => {
    const edges = Array.from({ length: 199 }, (_, edge) => `  N${Math.floor(edge / 10)} --> N${Math.floor(edge / 10) + 1 + (edge % 10)}`);
    return `\`\`\`mermaid\ngraph TD\n${edges.join('\n')}\n\`\`\`\n`;
  },
};
