import rehypeShikiFromHighlighter from '@shikijs/rehype/core';
import type { Element, Root } from 'hast';
import type { Root as MdastRoot } from 'mdast';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { classesOf, eachElement, textOf } from './hast';
import { CODE_THEMES, loadHighlighter, type Highlighter } from './highlighter';
import { SANITIZE_SCHEMA } from './sanitize-schema';

/** Code blocks longer than this are shown without highlighting (ADR-003: ~200 KB). */
export const SHIKI_MAX_BLOCK_CHARS = 200_000;

/** KaTeX limits against expansion bombs (SR-03); `trust: false` keeps `\href` and friends inert. */
export const KATEX_OPTIONS = { trust: false, maxExpand: 1000, maxSize: 50, throwOnError: false, strict: 'ignore' } as const;

/** Same prefix the sanitizer puts on author ids, so every id in a document has it (SR-02). */
export const ID_PREFIX = 'user-content-';

export interface OutlineEntry {
  depth: number;
  text: string;
  id: string;
  line: number;
}

export interface RenderResult {
  html: string;
  outline: OutlineEntry[];
  /** Link targets (`href`) in document order, without duplicates. */
  links: string[];
  /** Local image sources in document order, without duplicates; remote images never load. */
  images: string[];
  /** Parse and render time in milliseconds. */
  ms: number;
  cached: boolean;
}

// Blocks that carry `data-src-line` (ADR-003): enough for scroll anchors and view toggles.
const POSITIONED = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'pre', 'blockquote', 'tr', 'table', 'hr']);

interface Collected {
  frontmatter: { value: string; lang: string } | null;
  /** Source lines of the code blocks Shiki is about to replace, in document order. */
  highlighted: (number | null)[];
  outline: OutlineEntry[];
  links: Set<string>;
  images: Set<string>;
}

/** remark-rehype drops frontmatter; keep its raw text to show it after sanitizing. */
const liftFrontmatter = (collected: Collected) => () => (tree: MdastRoot) => {
  const first = tree.children[0];
  if (first && (first.type === 'yaml' || (first.type as string) === 'toml')) {
    collected.frontmatter = { value: (first as { value: string }).value, lang: first.type };
    tree.children.shift();
  }
};

const annotate = (collected: Collected) => () => (tree: Root) => {
  eachElement(tree, (node, index, parent) => {
    const line = node.position?.start.line;
    if (line !== undefined && POSITIONED.has(node.tagName)) node.properties['dataSrcLine'] = line;
    if (/^h[1-6]$/.test(node.tagName) && line !== undefined) {
      collected.outline.push({
        depth: Number(node.tagName[1]),
        text: textOf(node),
        id: String(node.properties['id'] ?? ''),
        line,
      });
    }
    if (node.tagName === 'a' && typeof node.properties['href'] === 'string') collected.links.add(node.properties['href']);
    if (node.tagName === 'img' && typeof node.properties['src'] === 'string') {
      const remote = remoteHost(node.properties['src']);
      if (remote === null) collected.images.add(node.properties['src']);
      else parent.children[index] = remotePlaceholder(node.properties['src'], remote);
    }
    if (node.tagName === 'pre') unhighlightIfHuge(node);
  });
  if (collected.frontmatter) tree.children.unshift(frontmatterBlock(collected.frontmatter));
};

function remoteHost(src: string): string | null {
  try {
    // A base keeps relative sources relative; anything with its own scheme or host is remote.
    const url = new URL(src, 'galeo-relative://document/');
    return url.protocol === 'galeo-relative:' ? null : url.host || url.protocol;
  } catch {
    return null;
  }
}

function remotePlaceholder(url: string, host: string): Element {
  return {
    type: 'element',
    tagName: 'span',
    properties: { className: ['galeo-remote-image'], dataHost: host, dataUrl: url },
    children: [{ type: 'text', value: `Remote content blocked (${host})` }],
  };
}

function unhighlightIfHuge(pre: Element): void {
  const code = pre.children[0];
  if (code?.type !== 'element' || textOf(code).length <= SHIKI_MAX_BLOCK_CHARS) return;
  code.properties['className'] = classesOf(code).filter((name) => !name.startsWith('language-'));
}

function frontmatterBlock({ value, lang }: { value: string; lang: string }): Element {
  return {
    type: 'element',
    tagName: 'details',
    properties: { className: ['galeo-frontmatter'], dataSrcLine: 1 },
    children: [
      { type: 'element', tagName: 'summary', properties: {}, children: [{ type: 'text', value: 'Frontmatter' }] },
      {
        type: 'element',
        tagName: 'pre',
        properties: {},
        children: [
          {
            type: 'element',
            tagName: 'code',
            properties: { className: [`language-${lang}`] },
            children: [{ type: 'text', value: `${value}\n` }],
          },
        ],
      },
    ],
  };
}

/** Shiki swaps each code block for its own `pre`, so note their lines just before it runs… */
const noteCodeLines = (collected: Collected) => () => (tree: Root) => {
  eachElement(tree, (node) => {
    const code = node.children[0];
    if (node.tagName !== 'pre' || code?.type !== 'element') return;
    if (!classesOf(code).some((name) => name.startsWith('language-'))) return;
    const line = node.properties['dataSrcLine'];
    collected.highlighted.push(typeof line === 'number' ? line : null);
  });
};

/** …and put them back on its output, which keeps the same order. */
const restoreCodeLines = (collected: Collected) => () => (tree: Root) => {
  let next = 0;
  eachElement(tree, (node) => {
    if (node.tagName !== 'pre' || !classesOf(node).includes('shiki')) return;
    const line = collected.highlighted[next++];
    if (line != null) node.properties['dataSrcLine'] = line;
  });
};

async function contentKey(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface Renderer {
  markdown(text: string): Promise<RenderResult>;
}

/** The Markdown pipeline (ADR-003), with a bounded cache keyed by content hash. */
export function createRenderer({ cacheEntries = 16 }: { cacheEntries?: number } = {}): Renderer {
  let highlighter: Promise<Highlighter> | undefined;
  const cache = new Map<string, Omit<RenderResult, 'cached'>>();

  async function run(text: string): Promise<Omit<RenderResult, 'cached'>> {
    const started = performance.now();
    const collected: Collected = { frontmatter: null, highlighted: [], outline: [], links: new Set(), images: new Set() };
    const shiki = await (highlighter ??= loadHighlighter());
    const file = await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkFrontmatter, ['yaml', 'toml'])
      .use(remarkMath)
      .use(liftFrontmatter(collected))
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
      .use(rehypeSanitize, SANITIZE_SCHEMA)
      .use(rehypeSlug, { prefix: ID_PREFIX })
      .use(annotate(collected))
      // KaTeX before Shiki, so Shiki never sees math as a code block; both run after sanitizing.
      .use(rehypeKatex, KATEX_OPTIONS)
      .use(noteCodeLines(collected))
      .use(() =>
        rehypeShikiFromHighlighter(shiki, {
          themes: CODE_THEMES,
          defaultColor: false,
          lazy: true,
          fallbackLanguage: 'text',
        }),
      )
      .use(restoreCodeLines(collected))
      .use(rehypeStringify)
      .process(text);
    return {
      html: String(file),
      outline: collected.outline,
      links: [...collected.links],
      images: [...collected.images],
      ms: performance.now() - started,
    };
  }

  return {
    async markdown(text) {
      const key = await contentKey(text);
      const hit = cache.get(key);
      if (hit) {
        cache.delete(key);
        cache.set(key, hit);
        return { ...hit, cached: true };
      }
      const result = await run(text);
      cache.set(key, result);
      if (cache.size > cacheEntries) cache.delete(cache.keys().next().value!);
      return { ...result, cached: false };
    },
  };
}
