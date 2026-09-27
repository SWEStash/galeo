import { useCallback, useEffect, useState } from 'react';
import type { RenderClient } from '../worker/client';

export type RenderState =
  | { status: 'idle' | 'pending'; html: null }
  | { status: 'done'; html: string }
  | { status: 'failed'; html: null };

/**
 * The worker's HTML for Markdown `text`, rendered only once `wanted` (the rendered view shows).
 * A failure stays failed until `retry`.
 */
export function useRenderedHtml(
  client: RenderClient | null,
  text: string | null,
  wanted: boolean,
): RenderState & { retry: () => void } {
  const [result, setResult] = useState<{ text: string; attempt: number; html: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!client || text === null || !wanted) return;
    if (result?.text === text && result.attempt === attempt) return;
    let current = true;
    client.markdown(text).then(
      ({ html }) => current && setResult({ text, attempt, html }),
      () => current && setResult({ text, attempt, html: null }),
    );
    return () => {
      current = false;
    };
  }, [client, text, wanted, result, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const settled = result?.text === text && result.attempt === attempt;
  if (settled && result.html !== null) return { status: 'done', html: result.html, retry };
  if (settled) return { status: 'failed', html: null, retry };
  return { status: text !== null && wanted ? 'pending' : 'idle', html: null, retry };
}
