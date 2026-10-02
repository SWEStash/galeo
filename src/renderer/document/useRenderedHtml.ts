import { useCallback, useEffect, useState } from 'react';
import type { RenderClient } from '../worker/client';
import type { OutlineEntry } from '../worker/pipeline/render';
import { loadMathStyles } from './host';

export type RenderState = (
  | { status: 'idle'; html: null }
  /** `html` is the last render's while the next one runs (a changed file keeps showing until then). */
  | { status: 'pending'; html: string | null }
  | { status: 'done'; html: string }
  | { status: 'failed'; html: null }
) & {
  /** The headings of the HTML shown. */
  outline: readonly OutlineEntry[];
};

const NO_OUTLINE: readonly OutlineEntry[] = [];

/**
 * The worker's HTML for Markdown `text`, rendered only once `wanted` (the rendered view shows).
 * A failure stays failed until `retry`. While a changed text renders, the last HTML stays.
 */
export function useRenderedHtml(
  client: RenderClient | null,
  text: string | null,
  wanted: boolean,
): RenderState & { retry: () => void } {
  const [result, setResult] = useState<{ text: string; attempt: number; html: string | null; outline: readonly OutlineEntry[] } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!client || text === null || !wanted) return;
    if (result?.text === text && result.attempt === attempt) return;
    let current = true;
    client
      .markdown(text)
      // Math shows only once KaTeX's styles are in, never unstyled.
      .then(async ({ html, math, outline }) => {
        if (math) await loadMathStyles();
        return { html, outline };
      })
      .then(
        ({ html, outline }) => current && setResult({ text, attempt, html, outline }),
        () => current && setResult({ text, attempt, html: null, outline: NO_OUTLINE }),
      );
    return () => {
      current = false;
    };
  }, [client, text, wanted, result, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const settled = result?.text === text && result.attempt === attempt;
  if (settled && result.html !== null) return { status: 'done', html: result.html, outline: result.outline, retry };
  if (settled) return { status: 'failed', html: null, outline: NO_OUTLINE, retry };
  if (text === null || !wanted) return { status: 'idle', html: null, outline: NO_OUTLINE, retry };
  return { status: 'pending', html: result?.html ?? null, outline: result?.outline ?? NO_OUTLINE, retry };
}
