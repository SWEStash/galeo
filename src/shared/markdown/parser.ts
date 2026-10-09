import type { PluggableList } from 'unified';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { SANITIZE_SCHEMA } from './sanitize-schema';

/**
 * Markdown to sanitized HTML tree: the steps the renderer and main's link extraction share, so
 * main's checks see exactly what the page can show (ADR-004). `mdast` runs on the Markdown tree
 * before it becomes HTML.
 */
export function articleParser({ mdast = [] }: { mdast?: PluggableList } = {}) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml', 'toml'])
    .use(remarkMath)
    .use(mdast)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize, SANITIZE_SCHEMA);
}
