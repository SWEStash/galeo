import type { Element, Properties, Root } from 'hast';
import type { Root as MdastRoot } from 'mdast';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';
import { classesOf, eachElement, textOf } from '../../../shared/markdown/hast';
import type { Highlighter } from './highlighter';
import { ID_PREFIX } from '../../../shared/markdown/ids';
import { articleParser } from '../../../shared/markdown/parser';
import { compactUrl, isLocalReference, isNetworkPathReference } from '../../../shared/markdown/urls';
import { countWords } from '../../../shared/words';
import type { WorkerFormat } from '../../../shared/formats';

/** Code blocks longer than this are shown without highlighting (ADR-003: ~200 KB). */
export const SHIKI_MAX_BLOCK_CHARS = 200_000;

/** KaTeX limits against expansion bombs (SR-03); `trust: false` keeps `\href` and friends inert. */
const KATEX_OPTIONS = { trust: false, maxExpand: 1000, maxSize: 50, throwOnError: false, strict: 'ignore' } as const;


export interface OutlineEntry {
  depth: number;
  text: string;
  id: string;
  line: number;
}

export interface RenderResult {
  html: string;
  /** It holds math: the page loads KaTeX's styles before showing it. */
  math: boolean;
  outline: OutlineEntry[];
  /** Link targets (`href`) in document order, without duplicates. */
  links: string[];
  /** Local image sources in document order, without duplicates; remote images never load. */
  images: string[];
  /** Words of prose, for the status bar: code blocks, math, diagrams and front matter aren't counted. */
  words: number;
  /** Parse and render time in milliseconds. */
  ms: number;
  cached: boolean;
}

// Blocks that carry `data-src-line` and `data-src-end` (ADR-003, ADR-014): enough for scroll
// anchors, view toggles and following a long block inside in split view.
const POSITIONED = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'pre', 'blockquote', 'tr', 'table', 'hr']);

/** An MDX component's box: positioned like the blocks it holds. */
const isMdxBox = (node: Element) => node.tagName === 'div' && typeof node.properties['dataGaleoMdx'] === 'string' && node.properties['dataGaleoMdx'] !== 'name';

/** A block's first and last source lines. */
type Lines = Partial<Pick<Properties, 'dataSrcLine' | 'dataSrcEnd'>>;

interface Collected {
  frontmatter: { value: string; lang: string; end: number } | null;
  /** Source lines of the code blocks Shiki is about to replace, in document order. */
  highlighted: Lines[];
  outline: OutlineEntry[];
  links: Set<string>;
  images: Set<string>;
}

/** remark-rehype drops frontmatter; keep its raw text to show it after sanitizing. */
const liftFrontmatter = (collected: Collected) => () => (tree: MdastRoot) => {
  const first = tree.children[0];
  if (first && (first.type === 'yaml' || (first.type as string) === 'toml')) {
    collected.frontmatter = { value: (first as { value: string }).value, lang: first.type, end: first.position?.end.line ?? 1 };
    tree.children.shift();
  }
};

const annotate = (collected: Collected) => () => (tree: Root) => {
  eachElement(tree, (node, index, parent) => {
    const line = node.position?.start.line;
    if (line !== undefined && (POSITIONED.has(node.tagName) || isMdxBox(node))) {
      node.properties['dataSrcLine'] = line;
      node.properties['dataSrcEnd'] = node.position?.end.line ?? line;
    }
    if (/^h[1-6]$/.test(node.tagName) && line !== undefined) {
      collected.outline.push({
        depth: Number(node.tagName[1]),
        text: textOf(node),
        id: String(node.properties['id'] ?? ''),
        line,
      });
    }
    if (node.tagName === 'a' && typeof node.properties['href'] === 'string') {
      // The sanitizer counts `//host/x` as relative; from the app page it would name another host.
      if (isNetworkPathReference(node.properties['href'])) delete node.properties['href'];
      else collected.links.add(node.properties['href']);
    }
    if (node.tagName === 'img') {
      const src = node.properties['src'];
      delete node.properties['src'];
      if (typeof src === 'string' && isLocalReference(src)) {
        // Loaded only once main has checked it against the document (ADR-004), never by the page.
        node.properties['dataGaleoSrc'] = src;
        collected.images.add(src);
      } else if (typeof src === 'string') {
        parent.children[index] = remotePlaceholder(src);
      }
    }
    if (node.tagName === 'pre') unhighlightIfHuge(node);
    // A task-list checkbox is named by its item (WCAG 4.1.2): its own text, not its sub-items'.
    if (node.tagName === 'input' && node.properties['type'] === 'checkbox') {
      const own = parent.children.filter((child) => !(child.type === 'element' && (child.tagName === 'ul' || child.tagName === 'ol')));
      node.properties['ariaLabel'] = own.map((child) => textOf(child)).join('').trim();
    }
  });
  if (collected.frontmatter) tree.children.unshift(frontmatterBlock(collected.frontmatter));
};

function hostOf(url: string): string {
  try {
    const trimmed = compactUrl(url).replace(/\\/g, '/');
    const parsed = new URL(isNetworkPathReference(url) ? `https:${trimmed}` : url);
    return parsed.host || parsed.protocol.replace(/:$/, '');
  } catch {
    return 'unknown host';
  }
}

function remotePlaceholder(url: string): Element {
  const host = hostOf(url);
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

function frontmatterBlock({ value, lang, end }: { value: string; lang: string; end: number }): Element {
  return {
    type: 'element',
    tagName: 'details',
    properties: { className: ['galeo-frontmatter'], dataSrcLine: 1, dataSrcEnd: end },
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

/**
 * Mermaid blocks are drawn by the page, lazily (ADR-003): here each becomes a placeholder holding
 * its source as plain code, shown as such until the diagram replaces it. Runs after sanitizing and
 * before Shiki, which would otherwise highlight it.
 */
const diagramPlaceholders = () => (tree: Root) => {
  eachElement(tree, (node, index, parent) => {
    const code = node.children[0];
    if (node.tagName !== 'pre' || code?.type !== 'element' || !classesOf(code).includes('language-mermaid')) return;
    const lines = linesOf(node);
    delete node.properties['dataSrcLine'];
    delete node.properties['dataSrcEnd'];
    code.properties['className'] = [];
    parent.children[index] = {
      type: 'element',
      tagName: 'div',
      properties: { className: ['galeo-diagram'], ...lines },
      children: [node],
    };
  });
};

// Parents in which a failed display formula stands as a block of its own.
const BLOCK_PARENTS = new Set(['div', 'section', 'blockquote', 'li', 'td', 'th', 'details']);

function mathErrorMessage(title: unknown): string {
  return typeof title === 'string' && title ? title.replace(/^ParseError: /, '') : 'This formula could not be typeset';
}

/**
 * KaTeX marks a formula it can't parse with its message in a hover-only `title`. Show it as an
 * inline error box instead, with the message and the formula's source (UX §4).
 */
const explainMathErrors = () => (tree: Root) => {
  eachElement(tree, (node, index, parent) => {
    if (!classesOf(node).includes('katex-error')) return;
    const block = parent.type === 'root' || BLOCK_PARENTS.has(parent.tagName);
    parent.children[index] = {
      type: 'element',
      tagName: block ? 'div' : 'span',
      properties: { className: ['galeo-block-error'], role: 'note' },
      children: [
        {
          type: 'element',
          tagName: 'span',
          properties: { className: ['galeo-block-error-message'] },
          children: [{ type: 'text', value: mathErrorMessage(node.properties['title']) }],
        },
        { type: 'element', tagName: 'code', properties: {}, children: [{ type: 'text', value: textOf(node) }] },
      ],
    };
  });
};

/** The source lines a block carries, to move onto the element that replaces it. */
function linesOf(node: Element): Lines {
  const { dataSrcLine, dataSrcEnd } = node.properties;
  return {
    ...(dataSrcLine === undefined ? {} : { dataSrcLine }),
    ...(dataSrcEnd === undefined ? {} : { dataSrcEnd }),
  };
}

/** Shiki swaps each code block for its own `pre`, so note their lines just before it runs… */
const noteCodeLines = (collected: Collected) => () => (tree: Root) => {
  eachElement(tree, (node) => {
    const code = node.children[0];
    if (node.tagName !== 'pre' || code?.type !== 'element') return;
    if (!classesOf(code).some((name) => name.startsWith('language-'))) return;
    collected.highlighted.push(linesOf(node));
  });
};

/** …and put them back on its output, which keeps the same order. */
const restoreCodeLines = (collected: Collected) => () => (tree: Root) => {
  let next = 0;
  eachElement(tree, (node) => {
    if (node.tagName !== 'pre' || !classesOf(node).includes('shiki')) return;
    Object.assign(node.properties, collected.highlighted[next++]);
  });
};

async function contentKey(format: WorkerFormat, text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${format}\n${text}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface Renderer {
  /**
   * Renders Markdown, or MDX with `format: 'mdx'`. `cache: false` neither reads nor fills the
   * cache: a live preview's every pause would evict useful entries (ADR-014).
   */
  markdown(text: string, options?: { cache?: boolean; format?: WorkerFormat }): Promise<RenderResult>;
}

// Inline elements run on within a word ("foo<em>bar</em>"); any other element separates words.
const INLINE = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'i', 'ins', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var']);
// Not prose: code blocks, math source, diagram source, front matter, blocked-image notices.
const NOT_PROSE = new Set(['math-inline', 'math-display', 'galeo-diagram', 'galeo-frontmatter', 'galeo-remote-image']);
// MDX: a component's name and props, and expressions, aren't prose; the text inside a component is.
const MDX_NOT_PROSE = new Set(['name', 'props', 'expression']);

/** The words of the document's prose, from the sanitized tree before math and code are drawn. */
function proseWords(tree: Root): number {
  const parts: string[] = [];
  const walk = (node: Root | Element) => {
    for (const child of node.children) {
      if (child.type === 'text') parts.push(child.value);
      if (child.type !== 'element' || child.tagName === 'pre' || classesOf(child).some((name) => NOT_PROSE.has(name)) || MDX_NOT_PROSE.has(String(child.properties['dataGaleoMdx']))) continue;
      const inline = INLINE.has(child.tagName);
      if (!inline) parts.push(' ');
      walk(child);
      if (!inline) parts.push(' ');
    }
  };
  walk(tree);
  return countWords(parts.join(''));
}

/** The Markdown pipeline (ADR-003), with a bounded cache keyed by content hash. */
/** Whether the sanitized tree holds math for KaTeX. */
function hasMath(tree: Root): boolean {
  let found = false;
  eachElement(tree, (node) => {
    found ||= classesOf(node).some((name) => name === 'math-inline' || name === 'math-display');
  });
  return found;
}

/** Whether it holds a code block for Shiki (math blocks are KaTeX's). */
function hasCode(tree: Root): boolean {
  let found = false;
  eachElement(tree, (node) => {
    const code = node.children[0];
    found ||=
      node.tagName === 'pre' &&
      code?.type === 'element' &&
      classesOf(code).some((name) => name.startsWith('language-') && name !== 'language-math');
  });
  return found;
}

// KaTeX and Shiki are heavy: each loads with the first document that needs it (ADR-003).
const loadKatex = () => import('rehype-katex').then((module) => module.default);
const loadShiki = () => Promise.all([import('./highlighter'), import('@shikijs/rehype/core')]);
// The MDX parser (with its JavaScript parser) loads with the first MDX document.
const loadMdx = () => import('remark-mdx').then((module) => module.default);

/** The Markdown pipeline (ADR-003), with a bounded cache keyed by content hash. */
export function createRenderer({ cacheEntries = 16 }: { cacheEntries?: number } = {}): Renderer {
  let shiki:
    | Promise<{
        highlighter: Highlighter;
        themes: { light: string; dark: string };
        colorReplacements: Record<string, Record<string, string>>;
        rehypeShiki: typeof import('@shikijs/rehype/core').default;
      }>
    | undefined;
  const cache = new Map<string, Omit<RenderResult, 'cached'>>();
  let remarkMdx: Promise<Awaited<ReturnType<typeof loadMdx>>> | undefined;

  async function run(format: WorkerFormat, text: string): Promise<Omit<RenderResult, 'cached'>> {
    const started = performance.now();
    const collected: Collected = { frontmatter: null, highlighted: [], outline: [], links: new Set(), images: new Set() };
    // First the document as sanitized HTML, which says what else it needs…
    const mdx = format === 'mdx' ? await (remarkMdx ??= loadMdx()) : null;
    const parse = articleParser({ mdx, mdast: [liftFrontmatter(collected)] })
      .use(rehypeSlug, { prefix: ID_PREFIX })
      .use(annotate(collected))
      .use(diagramPlaceholders);
    const tree = (await parse.run(parse.parse(text))) as Root;
    const words = proseWords(tree);
    // …then math and code, both after sanitizing; KaTeX before Shiki, so Shiki never sees math as a code block.
    const finish = unified();
    const math = hasMath(tree);
    if (math) finish.use(await loadKatex(), KATEX_OPTIONS).use(explainMathErrors);
    if (hasCode(tree)) {
      const { highlighter, themes, colorReplacements, rehypeShiki } = await (shiki ??= loadShiki().then(async ([module, rehype]) => ({
        highlighter: await module.loadHighlighter(),
        themes: module.CODE_THEMES,
        colorReplacements: module.CODE_COLOR_REPLACEMENTS,
        rehypeShiki: rehype.default,
      })));
      finish
        .use(noteCodeLines(collected))
        .use(() => rehypeShiki(highlighter, { themes, colorReplacements, defaultColor: false, lazy: true, fallbackLanguage: 'text' }))
        .use(restoreCodeLines(collected));
    }
    const html = finish.use(rehypeStringify).stringify((await finish.run(tree)) as Root);
    return {
      html,
      math,
      outline: collected.outline,
      links: [...collected.links],
      images: [...collected.images],
      words,
      ms: performance.now() - started,
    };
  }

  return {
    async markdown(text, { cache: useCache = true, format = 'markdown' } = {}) {
      if (!useCache) return { ...(await run(format, text)), cached: false };
      const key = await contentKey(format, text);
      const hit = cache.get(key);
      if (hit) {
        cache.delete(key);
        cache.set(key, hit);
        return { ...hit, cached: true };
      }
      const result = await run(format, text);
      cache.set(key, result);
      if (cache.size > cacheEntries) cache.delete(cache.keys().next().value!);
      return { ...result, cached: false };
    },
  };
}
