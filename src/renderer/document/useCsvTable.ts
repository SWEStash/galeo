import { useCallback, useEffect, useRef, useState } from 'react';
import type { CsvTable, Separator } from '../../shared/csv';
import { RENDER_ANYWAY_BUDGET_MS, RenderCancelled, RenderSuperseded, RenderTimeout, TABLE_BUDGET_MS, type RenderClient } from '../worker/client';

type FailReason = 'slow' | 'cancelled' | 'error';

/** A table and the text its offsets point into. */
interface Shown {
  text: string;
  table: CsvTable;
}

/** How reading a text ended. */
type Settled = ({ status: 'ready' } & Shown) | { status: 'too-large' } | { status: 'failed'; reason: FailReason };

export type CsvTableState = (
  | { status: 'idle' }
  /** The last table (and its text) stays while a new version of the text is read. */
  | ({ status: 'pending' } & (Shown | { text: null; table: null }))
  | Settled
  /** Live: the latest text didn't make a table, so the last good one stays (ADR-014). */
  | ({ status: 'paused'; reason: FailReason } & (Shown | { text: null; table: null }))
) & {
  retry: () => void;
  /** The reader asks for the table past its limit or its budget: Render anyway's budget (ADR-020). */
  showAnyway: () => void;
  cancel: () => void;
};

/**
 * The table for a CSV/TSV `text`: read by the worker once `wanted`, on the table budget, or Render
 * anyway's when `readerAsked` or after `showAnyway` (ADR-020). `live`: a preview of typing in split,
 * which keeps the last good table when the latest text fails. A failure stays until asked again.
 */
export function useCsvTable(
  client: RenderClient | null,
  text: string | null,
  wanted: boolean,
  { separator, readerAsked = false, live = false }: { separator: Separator | 'sniff'; readerAsked?: boolean; live?: boolean },
): CsvTableState {
  const [result, setResult] = useState<{ text: string; attempt: { count: number; long: boolean }; state: Settled } | null>(null);
  const [attempt, setAttempt] = useState({ count: 0, long: false });
  const lastGood = useRef<Shown | null>(null);
  const running = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!client || text === null || !wanted) return;
    if (result?.text === text && result.attempt === attempt) return;
    let current = true;
    const controller = (running.current = new AbortController());
    const budgetMs = readerAsked || attempt.long ? RENDER_ANYWAY_BUDGET_MS : TABLE_BUDGET_MS;
    client.table(text, { separator, budgetMs, signal: controller.signal, ...(live ? { live } : {}) }).then(
      (parsed) => {
        if (!current) return;
        if (parsed.state === 'table') lastGood.current = { text, table: parsed.table };
        setResult({ text, attempt, state: parsed.state === 'table' ? { status: 'ready', text, table: parsed.table } : { status: 'too-large' } });
      },
      (error: unknown) => {
        // Newer text took its place: its own job answers.
        if (!current || error instanceof RenderSuperseded) return;
        const reason = error instanceof RenderTimeout ? 'slow' : error instanceof RenderCancelled ? 'cancelled' : 'error';
        setResult({ text, attempt, state: { status: 'failed', reason } });
      },
    );
    return () => {
      current = false;
    };
  }, [client, text, separator, wanted, result, attempt, readerAsked, live]);

  const retry = useCallback(() => setAttempt(({ count }) => ({ count: count + 1, long: false })), []);
  const showAnyway = useCallback(() => setAttempt(({ count }) => ({ count: count + 1, long: true })), []);
  const cancel = useCallback(() => running.current?.abort(), []);
  const actions = { retry, showAnyway, cancel };
  const good = lastGood.current ?? { text: null, table: null };
  if (result?.text === text && result.attempt === attempt) {
    if (live && result.state.status === 'failed') return { status: 'paused', reason: result.state.reason, ...good, ...actions };
    return { ...result.state, ...actions };
  }
  if (text === null || !wanted) return { status: 'idle', ...actions };
  return { status: 'pending', ...good, ...actions };
}
