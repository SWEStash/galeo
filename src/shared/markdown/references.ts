import type { Root } from 'hast';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { eachElement } from './hast';
import { SANITIZE_SCHEMA } from './sanitize-schema';

// The links and images of a document, found the way the renderer finds them: the same parse and
// the same sanitizer, so main's checks see exactly what the page can show (ADR-004).

/** Browsers ignore whitespace and control characters in a URL's scheme and leading slashes. */
const compact = (url: string) => url.replace(/[\u0000- ]/g, '');

/** `//host/path` (or with backslashes, which browsers treat as slashes): another host. */
export function isNetworkPathReference(url: string): boolean {
  return /^[\\/]{2}/.test(compact(url));
}

/** A path relative to the document: no scheme and no host. */
export function isLocalReference(url: string): boolean {
  return !isNetworkPathReference(url) && !/^[a-z][a-z0-9+.-]*:/i.test(compact(url));
}

export interface References {
  /** Link targets as written, in document order, without duplicates. */
  links: string[];
  /** Local image sources, in document order, without duplicates. */
  images: string[];
}

/** The references a sanitized tree keeps: links to other hosts by `//` and non-local images don't count. */
export function collectReferences(tree: Root): References {
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

const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ['yaml', 'toml'])
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, SANITIZE_SCHEMA);

/** Parses Markdown as the renderer does, up to sanitizing, and collects its references. */
export function extractReferences(text: string): References {
  return collectReferences(parser.runSync(parser.parse(text)) as Root);
}
