import { defaultSchema, type Options as Schema } from 'rehype-sanitize';

/**
 * The allowlist for author content (SR-02): GitHub's schema, plus the classes remark-math puts on
 * math code so KaTeX can typeset it after sanitizing.
 */
export const SANITIZE_SCHEMA: Schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [['className', /^language-./, 'math-inline', 'math-display']],
  },
};
