import type { Pluggable, PluggableList } from 'unified';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { MDX_HANDLERS } from './mdx';
import { SANITIZE_SCHEMA } from './sanitize-schema';

/**
 * Markdown, or MDX given `remark-mdx` as `mdx`, to sanitized HTML tree: the steps the renderer and
 * main's link extraction share, so main's checks see exactly what the page can show (ADR-004).
 * The caller passes the MDX plugin so the render worker can load it only for MDX. `mdast` runs on
 * the Markdown tree before it becomes HTML.
 */
export function articleParser({ mdx = null, mdast = [] }: { mdx?: Pluggable | null; mdast?: PluggableList } = {}) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml', 'toml'])
    .use(remarkMath)
    .use(mdx ? [mdx] : [])
    .use(mdast)
    .use(remarkRehype, { allowDangerousHtml: true, ...(mdx ? { handlers: MDX_HANDLERS } : {}) })
    .use(rehypeRaw)
    .use(rehypeSanitize, SANITIZE_SCHEMA);
}
