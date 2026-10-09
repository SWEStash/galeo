import type { Element, ElementContent } from 'hast';
import type { MdxFlowExpression, MdxJsxAttribute, MdxJsxExpressionAttribute, MdxJsxFlowElement, MdxJsxTextElement, MdxTextExpression } from 'mdast-util-mdx';
import type { Options as ToHast } from 'remark-rehype';

// MDX is parsed, never run (ADR-003): imports and exports are hidden, components become labelled
// boxes, expressions show as code. Everything here is built before sanitizing, so the sanitizer
// sees it as it sees any Markdown. Generated parts carry `data-galeo-mdx`, which the page styles and
// the word count skips: the component's name on its box, and "name", "props" or "expression".

type Handlers = NonNullable<ToHast['handlers']>;
type State = Parameters<NonNullable<Handlers['paragraph']>>[0];
type JsxElement = MdxJsxFlowElement | MdxJsxTextElement;
type Attribute = MdxJsxAttribute | MdxJsxExpressionAttribute;

// Tags with no closing tag: one would be read as a second element (`</br>` is a `<br>`).
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

const text = (value: string): ElementContent => ({ type: 'text', value });
const marked = (tagName: string, part: string, children: ElementContent[]): Element => ({ type: 'element', tagName, properties: { dataGaleoMdx: part }, children });

/** How a prop reads: `"text"`, `{expression}`, or `true` for a bare one (`<Details open>`). */
function propValue(attribute: MdxJsxAttribute): string {
  if (attribute.value === null || attribute.value === undefined) return 'true';
  return typeof attribute.value === 'string' ? JSON.stringify(attribute.value) : `{${attribute.value.value}}`;
}

/** A lowercase tag whose props are all plain strings: HTML, as in a Markdown file. */
function isHtml(node: JsxElement): node is JsxElement & { name: string; attributes: MdxJsxAttribute[] } {
  return (
    node.name !== null &&
    /^[a-z][a-z0-9-]*$/.test(node.name) &&
    node.attributes.every((attribute) => attribute.type === 'mdxJsxAttribute' && (attribute.value === null || typeof attribute.value === 'string'))
  );
}

const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** The same raw tags Markdown's inline HTML gives, so rehype-raw and the sanitizer treat them alike. */
function asHtml(state: State, node: JsxElement & { name: string; attributes: MdxJsxAttribute[] }): ElementContent[] {
  const attributes = (node.attributes as MdxJsxAttribute[]).map(({ name, value }) => (value === null || value === undefined ? ` ${name}` : ` ${name}="${escapeAttribute(value as string)}"`));
  const open = { type: 'raw', value: `<${node.name}${attributes.join('')}>` } as unknown as ElementContent;
  if (VOID.has(node.name)) return [open];
  return [open, ...state.all(node), { type: 'raw', value: `</${node.name}>` } as unknown as ElementContent];
}

function propsList(attributes: Attribute[]): Element {
  const items = attributes.flatMap((attribute): ElementContent[] =>
    attribute.type === 'mdxJsxExpressionAttribute'
      ? [{ type: 'element', tagName: 'dt', properties: {}, children: [text(`{${attribute.value}}`)] }]
      : [
          { type: 'element', tagName: 'dt', properties: {}, children: [text(attribute.name)] },
          { type: 'element', tagName: 'dd', properties: {}, children: [text(propValue(attribute))] },
        ],
  );
  return marked('dl', 'props', items);
}

/** A tag as written, for an inline label: `<Badge label="new" />`. */
function inlineTag(node: JsxElement): string {
  const props = node.attributes.map((attribute) =>
    attribute.type === 'mdxJsxExpressionAttribute' ? ` {${attribute.value}}` : attribute.value === null || attribute.value === undefined ? ` ${attribute.name}` : ` ${attribute.name}=${propValue(attribute)}`,
  );
  return `<${node.name ?? ''}${props.join('')}${node.children.length === 0 ? ' />' : '>'}`;
}

function component(state: State, node: JsxElement): ElementContent | ElementContent[] {
  if (isHtml(node)) return asHtml(state, node);
  const name = node.name ?? 'fragment';
  const box: Element =
    node.type === 'mdxJsxFlowElement'
      ? marked('div', name, [marked('code', 'name', [text(`<${node.name ?? ''}>`)]), ...(node.attributes.length > 0 ? [propsList(node.attributes)] : []), ...state.all(node)])
      : marked('span', name, [marked('code', 'name', [text(inlineTag(node))]), ...state.all(node)]);
  state.patch(node, box);
  return box;
}

/** An expression that is only a comment (`{/* … *\/}`) shows nothing, as on the site. */
const onlyComment = (node: MdxFlowExpression | MdxTextExpression) => node.data?.estree?.body.length === 0;

function expression(node: MdxFlowExpression | MdxTextExpression): Element | undefined {
  if (onlyComment(node)) return undefined;
  const code = marked('code', 'expression', [text(`{${node.value}}`)]);
  return node.type === 'mdxFlowExpression' ? marked('pre', 'expression', [{ ...code, properties: {} }]) : code;
}

export const MDX_HANDLERS: Handlers = {
  mdxjsEsm: () => undefined,
  mdxJsxFlowElement: (state, node: MdxJsxFlowElement) => component(state, node),
  mdxJsxTextElement: (state, node: MdxJsxTextElement) => component(state, node),
  mdxFlowExpression: (state, node: MdxFlowExpression) => {
    const result = expression(node);
    if (result) state.patch(node, result);
    return result;
  },
  mdxTextExpression: (_state, node: MdxTextExpression) => expression(node),
};
