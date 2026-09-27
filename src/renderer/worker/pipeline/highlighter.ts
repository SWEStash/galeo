import { createBundledHighlighter } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages } from 'shiki/langs';

/** The code themes, matching the blog's (ADR-003). */
export const CODE_THEMES = { light: 'github-light', dark: 'github-dark' } as const;

// Built from `shiki/core` rather than `shiki`, whose default engine is WebAssembly (the CSP has no
// 'wasm-unsafe-eval'). Each grammar is its own chunk, loaded the first time a document uses it.
// A forgiving engine skips the few patterns JavaScript regexes can't express.
const createHighlighter = createBundledHighlighter({
  langs: bundledLanguages,
  themes: {
    'github-light': () => import('shiki/themes/github-light.mjs'),
    'github-dark': () => import('shiki/themes/github-dark.mjs'),
  },
  engine: () => createJavaScriptRegexEngine({ forgiving: true }),
});

export type Highlighter = Awaited<ReturnType<typeof createHighlighter>>;

export function loadHighlighter(): Promise<Highlighter> {
  return createHighlighter({ themes: Object.values(CODE_THEMES), langs: [] });
}
