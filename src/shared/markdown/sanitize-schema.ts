import { defaultSchema, type Options as Schema } from 'rehype-sanitize';

// Removed with their content, so nothing inside shows up as text either.
const STRIP = [
  'script', 'style', 'template', 'noscript', 'iframe', 'frame', 'object', 'embed', 'textarea', 'select',
  'title', 'xmp', 'noembed', 'noframes', 'svg', 'math',
];

// `picture`/`source` would load images outside main's image check; forms are gone anyway.
const DROPPED_TAGS = new Set(['picture', 'source']);
const DROPPED_ATTRIBUTES = new Set(['accessKey', 'tabIndex', 'action', 'encType', 'method']);

/**
 * The allowlist for author content (SR-02): GitHub's schema, tightened. Links keep only
 * `http`/`https`/`mailto` or relative targets; ids and names get the `user-content-` prefix; no
 * `style`, no event handlers, and no element that runs code, loads a resource or changes the page
 * (`link`, `meta` and `base` are never allowed). Access keys and tab stops are dropped so a
 * document can't take the app's shortcuts or trap focus. remark-math's classes are kept so KaTeX
 * can typeset math after sanitizing.
 */
export const SANITIZE_SCHEMA: Schema = {
  ...defaultSchema,
  tagNames: defaultSchema.tagNames!.filter((tag) => !DROPPED_TAGS.has(tag)),
  strip: STRIP,
  protocols: { ...defaultSchema.protocols, href: ['http', 'https', 'mailto'] },
  attributes: {
    ...Object.fromEntries(Object.entries(defaultSchema.attributes!).filter(([tag]) => !DROPPED_TAGS.has(tag))),
    '*': defaultSchema.attributes!['*']!.filter((name) => typeof name !== 'string' || !DROPPED_ATTRIBUTES.has(name)),
    code: [['className', /^language-./, 'math-inline', 'math-display']],
  },
};
