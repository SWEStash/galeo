import type { Element, Root } from 'hast';

const TITLES = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' } as const;

/** `[!TYPE]` alone on the first line of the quote's first paragraph. */
const MARKER = /^\[!([a-z]+)\][ \t]*(\r?\n|$)/i;

/**
 * GitHub-style callouts (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`): a quote
 * at the top level of the document, as on GitHub, becomes a titled callout. It runs after the
 * sanitizer, so the classes are only ever ours, and it adds no link, image or script.
 */
export const callouts = () => (tree: Root) => {
  for (const node of tree.children) {
    if (node.type === 'element' && node.tagName === 'blockquote') makeCallout(node);
  }
};

function makeCallout(quote: Element): void {
  const first = quote.children.find((child) => child.type === 'element');
  if (first?.type !== 'element' || first.tagName !== 'p') return;
  const text = first.children[0];
  if (text?.type !== 'text') return;
  const match = MARKER.exec(text.value);
  const type = match?.[1]?.toLowerCase();
  if (!match || !isType(type)) return;
  // At the end of its text, the marker must end the paragraph too: nothing else on its line.
  if (!match[2] && first.children.length > 1) return;

  const rest = text.value.slice(match[0].length);
  if (rest) text.value = rest;
  else first.children.shift();
  if (first.children.length === 0) quote.children.splice(quote.children.indexOf(first), 1);

  quote.properties['className'] = ['galeo-callout', `galeo-callout-${type}`];
  quote.children.unshift({
    type: 'element',
    tagName: 'p',
    properties: { className: ['galeo-callout-title'] },
    children: [{ type: 'text', value: TITLES[type] }],
  });
}

const isType = (type: string | undefined): type is keyof typeof TITLES => type !== undefined && Object.hasOwn(TITLES, type);
