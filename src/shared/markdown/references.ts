import type { Element, Root } from 'hast';
import remarkMdx from 'remark-mdx';
import type { WorkerFormat } from '../formats';
import { eachElement } from './hast';
import { articleParser } from './parser';
import { isLocalReference, isNetworkPathReference } from './urls';

// The links and images of a document, found the way the renderer finds them: the same parse and
// the same sanitizer, so main's checks see exactly what the page can show (ADR-004).

export interface References {
  /** Link targets as written, in document order, without duplicates. */
  links: string[];
  /** Local image sources, in document order, without duplicates. */
  images: string[];
  /** The source line of each task item (`- [ ]`), in document order: the boxes ticking may flip (ADR-031). */
  tasks: number[];
}

/** The references a sanitized tree keeps: links to other hosts by `//` and non-local images don't count. */
function collectReferences(tree: Root): References {
  const links = new Set<string>();
  const images = new Set<string>();
  const tasks: number[] = [];
  eachElement(tree, (node) => {
    const line = node.position?.start.line;
    if (node.tagName === 'li' && line !== undefined && isTaskItem(node)) tasks.push(line);
    const href = node.properties['href'];
    if (node.tagName === 'a' && typeof href === 'string' && !isNetworkPathReference(href)) links.add(href);
    const src = node.properties['src'];
    if (node.tagName === 'img' && typeof src === 'string' && isLocalReference(src)) images.add(src);
  });
  return { links: [...links], images: [...images], tasks };
}

const firstElement = (node: Element) => node.children.find((child): child is Element => child.type === 'element');
const isCheckbox = (node: Element | undefined) => node?.tagName === 'input' && node.properties['type'] === 'checkbox';

/** A list item whose box comes first: in the item itself (a tight list) or in its first paragraph (a loose one). */
function isTaskItem(item: Element): boolean {
  const first = firstElement(item);
  return isCheckbox(first) || (first?.tagName === 'p' && isCheckbox(firstElement(first)));
}

const parsers = { markdown: articleParser(), mdx: articleParser({ mdx: remarkMdx }) };

/** Parses Markdown or MDX as the renderer does, up to sanitizing, and collects its references. */
export function extractReferences(text: string, format: WorkerFormat = 'markdown'): References {
  const parser = parsers[format];
  return collectReferences(parser.runSync(parser.parse(text)) as Root);
}

/** The `references` task as main's worker thread runs it: `{ text, format }` in, references out. */
export function referencesTask(input: unknown): References {
  const { text, format } = (input ?? {}) as { text?: unknown; format?: unknown };
  if (typeof text !== 'string' || (format !== 'markdown' && format !== 'mdx')) throw new Error('references: bad input');
  return extractReferences(text, format);
}
