import type { Root } from 'hast';
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
}

/** The references a sanitized tree keeps: links to other hosts by `//` and non-local images don't count. */
function collectReferences(tree: Root): References {
  const links = new Set<string>();
  const images = new Set<string>();
  eachElement(tree, (node) => {
    const href = node.properties['href'];
    if (node.tagName === 'a' && typeof href === 'string' && !isNetworkPathReference(href)) links.add(href);
    const src = node.properties['src'];
    if (node.tagName === 'img' && typeof src === 'string' && isLocalReference(src)) images.add(src);
  });
  return { links: [...links], images: [...images] };
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
