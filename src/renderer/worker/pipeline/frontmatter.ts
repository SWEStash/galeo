import type { Element, ElementContent } from 'hast';

const FIELD = /^([A-Za-z0-9_][\w.-]*)[ \t]*:[ \t]+(.+?)[ \t]*$/;
/** Values YAML reads as something other than plain text: block scalars, anchors, aliases, tags, comments. */
const NOT_PLAIN = /^[|>&*!#]/;

/**
 * Front matter that is only `key: value` lines, as fields; null for anything else (nesting, lists,
 * multi-line values, YAML's anchors and tags, TOML), which then shows as its source. No YAML parser:
 * the plain case is what posts and ADRs use, and the source is always one Ctrl+U away.
 */
export function flatFields(value: string, lang: string): [string, string][] | null {
  if (lang !== 'yaml') return null;
  const fields = new Map<string, string>();
  for (const line of value.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const match = FIELD.exec(line);
    if (!match || NOT_PLAIN.test(match[2]!) || fields.has(match[1]!)) return null;
    fields.set(match[1]!, unquote(match[2]!));
  }
  return fields.size ? [...fields] : null;
}

function unquote(value: string): string {
  const quote = value[0];
  return value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote) ? value.slice(1, -1) : value;
}

const element = (tagName: string, children: ElementContent[], properties: Element['properties'] = {}): Element => ({
  type: 'element',
  tagName,
  properties,
  children,
});
const text = (value: string): ElementContent => ({ type: 'text', value });

/** The block shown above the article: the fields, open, or the highlighted source, collapsed. */
export function frontmatterBlock({ value, lang, end }: { value: string; lang: string; end: number }): Element {
  const fields = flatFields(value, lang);
  const body = fields
    ? element('dl', fields.flatMap(([key, field]) => [element('dt', [text(key)]), element('dd', [text(field)])]))
    : element('pre', [element('code', [text(`${value}\n`)], { className: [`language-${lang}`] })]);
  return element('details', [element('summary', [text('Front matter')]), body], {
    className: ['galeo-frontmatter'],
    dataSrcLine: 1,
    dataSrcEnd: end,
    ...(fields ? { open: true } : {}),
  });
}
