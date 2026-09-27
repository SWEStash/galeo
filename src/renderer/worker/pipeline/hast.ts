import type { Element, ElementContent, Root, RootContent } from 'hast';

type Parent = Root | Element;

/**
 * Visits every element in document order; the visitor may replace `parent.children[index]`.
 * Descends into nested roots, which is how Shiki's replacement fragments sit in the tree.
 */
export function eachElement(tree: Root, visit: (node: Element, index: number, parent: Parent) => void): void {
  const walk = (parent: Parent) => {
    parent.children.forEach((child: RootContent | ElementContent, index) => {
      if ((child.type as string) === 'root') return walk(child as unknown as Root);
      if (child.type !== 'element') return;
      visit(child, index, parent);
      const current = parent.children[index];
      if (current?.type === 'element') walk(current);
    });
  };
  walk(tree);
}

/** The text content of a node, like `Node.textContent`. */
export function textOf(node: Root | RootContent | ElementContent): string {
  if (node.type === 'text') return node.value;
  if ('children' in node) return node.children.map(textOf).join('');
  return '';
}

/** An element's classes: `className` arrays from the parser, or a `class` string from Shiki. */
export function classesOf(node: Element): string[] {
  const value = node.properties['className'] ?? node.properties['class'];
  if (Array.isArray(value)) return value.map(String);
  return typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : [];
}
