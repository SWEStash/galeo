import { useCallback, useEffect, useRef, useState } from 'react';
import { RENDER_ANYWAY_BUDGET_MS, RenderSuperseded, RenderTimeout, type RenderClient } from '../worker/client';
import type { OutlineEntry } from '../worker/pipeline/render';
import type { WorkerFormat } from '../../shared/formats';
import { loadMathStyles } from './host';

export type RenderState = (
  | { status: 'idle'; html: null }
  /** `html` is the last render's while the next one runs (a changed file keeps showing until then). */
  | { status: 'pending'; html: string | null }
  | { status: 'done'; html: string }
  /** `slow`: over the render budget (the reader may render anyway); `error`: the render broke. */
  | { status: 'failed'; html: null; reason: 'slow' | 'error' }
  /** Live: the latest text didn't render, so the last good preview stays (ADR-014). */
  | { status: 'paused'; html: string | null; reason: 'slow' | 'error' }
) & {
  /** The headings of the HTML shown. */
  outline: readonly OutlineEntry[];
  /** Its words of prose, once rendered. */
  words: number | null;
};

const NO_OUTLINE: readonly OutlineEntry[] = [];

interface Attempt {
  /** Counts the reader's retries, so the same text renders again. */
  count: number;
  /** The reader chose to wait for a slow render. */
  long: boolean;
}

/**
 * The worker's HTML for `text` in its `format` (Markdown or MDX), rendered only once `wanted` (the rendered view shows).
 * `readerAsked`: the reader asked for this render (a document over the render limit opens as
 * source), so it waits as long as Render anyway does. `live`: a preview of typing in split, which
 * keeps the last good HTML when the latest text doesn't render.
 * A failure stays failed until `retry` (or `renderAnyway`, with the long budget, after a render
 * that was too slow). While a changed text renders, the last HTML stays.
 */
export function useRenderedHtml(
  client: RenderClient | null,
  text: string | null,
  wanted: boolean,
  { readerAsked = false, live = false, format = 'markdown' }: { readerAsked?: boolean; live?: boolean; format?: WorkerFormat } = {},
): RenderState & { retry: () => void; renderAnyway: () => void } {
  const [result, setResult] = useState<{
    text: string;
    format: WorkerFormat;
    attempt: Attempt;
    html: string | null;
    reason: 'slow' | 'error';
    outline: readonly OutlineEntry[];
    words: number | null;
  } | null>(null);
  const [attempt, setAttempt] = useState<Attempt>({ count: 0, long: false });
  const lastGood = useRef<{ html: string; outline: readonly OutlineEntry[]; words: number | null } | null>(null);

  useEffect(() => {
    if (!client || text === null || !wanted) return;
    if (result?.text === text && result.format === format && result.attempt === attempt) return;
    let current = true;
    client
      .markdown(text, { format, ...(attempt.long || readerAsked ? { budgetMs: RENDER_ANYWAY_BUDGET_MS } : {}), ...(live ? { live } : {}) })
      // Math shows only once KaTeX's styles are in, never unstyled.
      .then(async ({ html, math, outline, words }) => {
        if (math) await loadMathStyles();
        return { html, outline, words };
      })
      .then(
        ({ html, outline, words }) => {
          if (!current) return;
          lastGood.current = { html, outline, words };
          setResult({ text, format, attempt, html, reason: 'error', outline, words });
        },
        (error: unknown) => {
          // Newer text took its place: its own render answers.
          if (!current || error instanceof RenderSuperseded) return;
          setResult({ text, format, attempt, html: null, reason: error instanceof RenderTimeout ? 'slow' : 'error', outline: NO_OUTLINE, words: null });
        },
      );
    return () => {
      current = false;
    };
  }, [client, text, format, wanted, result, attempt, readerAsked, live]);

  const retry = useCallback(() => setAttempt(({ count }) => ({ count: count + 1, long: false })), []);
  const renderAnyway = useCallback(() => setAttempt(({ count }) => ({ count: count + 1, long: true })), []);
  const actions = { retry, renderAnyway };
  const settled = result?.text === text && result.format === format && result.attempt === attempt;
  const good = lastGood.current;
  if (settled && result.html !== null) return { status: 'done', html: result.html, outline: result.outline, words: result.words, ...actions };
  if (settled && live) return { status: 'paused', html: good?.html ?? null, reason: result.reason, outline: good?.outline ?? NO_OUTLINE, words: good?.words ?? null, ...actions };
  if (settled) return { status: 'failed', html: null, reason: result.reason, outline: NO_OUTLINE, words: null, ...actions };
  if (text === null || !wanted) return { status: 'idle', html: null, outline: NO_OUTLINE, words: null, ...actions };
  return { status: 'pending', html: good?.html ?? null, outline: good?.outline ?? NO_OUTLINE, words: good?.words ?? null, ...actions };
}
