import { parseCsv, type CsvParse, type Separator } from '../../shared/csv';
import type { WorkerFormat } from '../../shared/formats';
import { indexJson, type JsonParse } from '../../shared/json-index';
import type { Renderer, RenderResult } from './pipeline/render';

/**
 * Window → worker: one job. `kind` says which: a Markdown or MDX `article` (ADR-003's format
 * registry), a CSV/TSV `table` (ADR-018; `sniff` tells `,` from `;` in a `.csv`) or a `json` tree.
 */
export type RenderRequest =
  | {
      type: 'render';
      kind: 'article';
      id: number;
      format: WorkerFormat;
      text: string;
      /** A live preview's render: the cache is neither read nor filled. */
      noCache?: true;
    }
  | { type: 'render'; kind: 'table'; id: number; separator: Separator | 'sniff'; text: string }
  | { type: 'render'; kind: 'json'; id: number; text: string };

/** Worker → window, matched to the request by `id`. */
export type WorkerReply =
  | { type: 'rendered'; id: number; result: RenderResult }
  | { type: 'table'; id: number; result: CsvParse }
  | { type: 'json'; id: number; result: JsonParse }
  /** `line`: where an MDX syntax error is. */
  | { type: 'failed'; id: number; message: string; line?: number };

const SEPARATORS: readonly unknown[] = [',', ';', '\t', '|', 'sniff'];

function isRenderRequest(message: unknown): message is RenderRequest {
  const m = message as { type?: unknown; kind?: unknown; id?: unknown; text?: unknown; format?: unknown; separator?: unknown } | null;
  if (m?.type !== 'render' || typeof m.id !== 'number' || typeof m.text !== 'string') return false;
  if (m.kind === 'article') return m.format === 'markdown' || m.format === 'mdx';
  return m.kind === 'json' || (m.kind === 'table' && SEPARATORS.includes(m.separator));
}

/** A table's or a tree's arrays, handed to the window rather than copied (millions of entries' worth). */
function transferOf(result: CsvParse | JsonParse): Transferable[] {
  const arrays = result.state === 'table' ? result.table : result.state === 'tree' ? result.tree : {};
  return Object.values(arrays).flatMap((value) => (ArrayBuffer.isView(value) ? [value.buffer] : []));
}

/**
 * The worker's message loop, apart from `self` so it can be tested directly. The Markdown
 * pipeline loads with the first article, so a window showing only other formats never pays for it.
 */
export function createMessageHandler(
  loadRenderer: () => Promise<Renderer>,
  reply: (message: WorkerReply | 'ready', transfer?: Transferable[]) => void,
) {
  let renderer: Promise<Renderer> | undefined;
  return async (message: unknown): Promise<void> => {
    if (message === 'ping') return reply('ready');
    if (!isRenderRequest(message)) return;
    try {
      if (message.kind === 'table') {
        const result = parseCsv(message.text, message.separator);
        return reply({ type: 'table', id: message.id, result }, transferOf(result));
      }
      if (message.kind === 'json') {
        const result = indexJson(message.text);
        return reply({ type: 'json', id: message.id, result }, transferOf(result));
      }
      renderer ??= loadRenderer().catch((error: unknown) => {
        // A failed load fails this request only; the next one tries again.
        renderer = undefined;
        throw error;
      });
      reply({ type: 'rendered', id: message.id, result: await (await renderer).markdown(message.text, { cache: message.noCache !== true, format: message.format }) });
    } catch (error) {
      const line = (error as { line?: unknown } | null)?.line;
      reply({ type: 'failed', id: message.id, message: error instanceof Error ? error.message : String(error), ...(typeof line === 'number' ? { line } : {}) });
    }
  };
}
