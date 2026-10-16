import { useCallback, useEffect, useRef, useState } from 'react';
import { RENDER_ANYWAY_BUDGET_MS, RenderCancelled, RenderTimeout, type RenderClient } from '../worker/client';
import { createTreeModel, type TreeModel } from './json-tree-model';

/** How reading a JSON text ended. */
type Settled =
  | { status: 'ready'; model: TreeModel }
  /** Not JSON: where it first breaks, 1-based. */
  | { status: 'invalid'; line: number; column: number }
  /** Past the tree's node or depth limit (ADR-018). */
  | { status: 'too-large' }
  /** `slow`: over the render budget; `cancelled`: by the reader (ADR-020); `error`: the worker broke. */
  | { status: 'failed'; reason: 'slow' | 'cancelled' | 'error' };

export type JsonTreeState = (
  | { status: 'idle' }
  /** `model` is the last tree's while a new version of the text is read. */
  | { status: 'pending'; model: TreeModel | null }
  | Settled
) & { retry: () => void; cancel: () => void };

/**
 * The JSON tree for `text`: the worker indexes it once `wanted` (the tree view shows), on the
 * render budget, or Render anyway's when `readerAsked`. A failure stays until `retry`.
 */
export function useJsonTree(client: RenderClient | null, text: string | null, wanted: boolean, { readerAsked = false }: { readerAsked?: boolean } = {}): JsonTreeState {
  const [result, setResult] = useState<{ text: string; attempt: number; state: Settled } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const lastGood = useRef<TreeModel | null>(null);
  const running = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!client || text === null || !wanted) return;
    if (result?.text === text && result.attempt === attempt) return;
    let current = true;
    const controller = (running.current = new AbortController());
    client.json(text, { ...(readerAsked ? { budgetMs: RENDER_ANYWAY_BUDGET_MS } : {}), signal: controller.signal }).then(
      (parsed) => {
        if (!current) return;
        let state: Settled;
        if (parsed.state === 'tree') {
          const model = createTreeModel(text, parsed.tree);
          lastGood.current = model;
          state = { status: 'ready', model };
        } else if (parsed.state === 'invalid') state = { status: 'invalid', line: parsed.line, column: parsed.column };
        else state = { status: 'too-large' };
        setResult({ text, attempt, state });
      },
      (error: unknown) => {
        const reason = error instanceof RenderTimeout ? 'slow' : error instanceof RenderCancelled ? 'cancelled' : 'error';
        if (current) setResult({ text, attempt, state: { status: 'failed', reason } });
      },
    );
    return () => {
      current = false;
    };
  }, [client, text, wanted, result, attempt, readerAsked]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  const cancel = useCallback(() => running.current?.abort(), []);
  if (result?.text === text && result.attempt === attempt) return { ...result.state, retry, cancel };
  if (text === null || !wanted) return { status: 'idle', retry, cancel };
  return { status: 'pending', model: lastGood.current, retry, cancel };
}
