import { useCallback, useEffect, useState } from 'react';
import { RENDER_ANYWAY_BUDGET_MS, RenderTimeout, type RenderClient } from '../worker/client';
import type { OutlineEntry } from '../worker/pipeline/render';
import { loadMathStyles } from './host';

export type RenderState = (
  | { status: 'idle'; html: null }
  /** `html` is the last render's while the next one runs (a changed file keeps showing until then). */
  | { status: 'pending'; html: string | null }
  | { status: 'done'; html: string }
  /** `slow`: over the render budget (the reader may render anyway); `error`: the render broke. */
  | { status: 'failed'; html: null; reason: 'slow' | 'error' }
) & {
  /** The headings of the HTML shown. */
  outline: readonly OutlineEntry[];
};

const NO_OUTLINE: readonly OutlineEntry[] = [];

interface Attempt {
  /** Counts the reader's retries, so the same text renders again. */
  count: number;
  /** The reader chose to wait for a slow render. */
  long: boolean;
}

/**
 * The worker's HTML for Markdown `text`, rendered only once `wanted` (the rendered view shows).
 * A failure stays failed until `retry` (or `renderAnyway`, with the long budget, after a render
 * that was too slow). While a changed text renders, the last HTML stays.
 */
export function useRenderedHtml(
  client: RenderClient | null,
  text: string | null,
  wanted: boolean,
): RenderState & { retry: () => void; renderAnyway: () => void } {
  const [result, setResult] = useState<{
    text: string;
    attempt: Attempt;
    html: string | null;
    reason: 'slow' | 'error';
    outline: readonly OutlineEntry[];
  } | null>(null);
  const [attempt, setAttempt] = useState<Attempt>({ count: 0, long: false });

  useEffect(() => {
    if (!client || text === null || !wanted) return;
    if (result?.text === text && result.attempt === attempt) return;
    let current = true;
    client
      .markdown(text, attempt.long ? { budgetMs: RENDER_ANYWAY_BUDGET_MS } : {})
      // Math shows only once KaTeX's styles are in, never unstyled.
      .then(async ({ html, math, outline }) => {
        if (math) await loadMathStyles();
        return { html, outline };
      })
      .then(
        ({ html, outline }) => current && setResult({ text, attempt, html, reason: 'error', outline }),
        (error: unknown) =>
          current && setResult({ text, attempt, html: null, reason: error instanceof RenderTimeout ? 'slow' : 'error', outline: NO_OUTLINE }),
      );
    return () => {
      current = false;
    };
  }, [client, text, wanted, result, attempt]);

  const retry = useCallback(() => setAttempt(({ count }) => ({ count: count + 1, long: false })), []);
  const renderAnyway = useCallback(() => setAttempt(({ count }) => ({ count: count + 1, long: true })), []);
  const actions = { retry, renderAnyway };
  const settled = result?.text === text && result.attempt === attempt;
  if (settled && result.html !== null) return { status: 'done', html: result.html, outline: result.outline, ...actions };
  if (settled) return { status: 'failed', html: null, reason: result.reason, outline: NO_OUTLINE, ...actions };
  if (text === null || !wanted) return { status: 'idle', html: null, outline: NO_OUTLINE, ...actions };
  return { status: 'pending', html: result?.html ?? null, outline: result?.outline ?? NO_OUTLINE, ...actions };
}
