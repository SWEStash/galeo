import type { WorkerFormat } from '../../shared/formats';
import type { Renderer, RenderResult } from './pipeline/render';

/**
 * Window → worker: one job. `kind` says which: `article` is a Markdown or MDX article (ADR-003's
 * format registry); the rich views' jobs join it (ADR-018).
 */
export interface RenderRequest {
  type: 'render';
  kind: 'article';
  id: number;
  format: WorkerFormat;
  text: string;
  /** A live preview's render: the cache is neither read nor filled. */
  noCache?: true;
}

/** Worker → window, matched to the request by `id`. */
export type WorkerReply =
  | { type: 'rendered'; id: number; result: RenderResult }
  /** `line`: where an MDX syntax error is. */
  | { type: 'failed'; id: number; message: string; line?: number };

function isRenderRequest(message: unknown): message is RenderRequest {
  const m = message as Partial<RenderRequest> | null;
  return (
    m?.type === 'render' &&
    m.kind === 'article' &&
    typeof m.id === 'number' &&
    (m.format === 'markdown' || m.format === 'mdx') &&
    typeof m.text === 'string'
  );
}

/**
 * The worker's message loop, apart from `self` so it can be tested directly. The Markdown
 * pipeline loads with the first article, so a window showing only other formats never pays for it.
 */
export function createMessageHandler(loadRenderer: () => Promise<Renderer>, reply: (message: WorkerReply | 'ready') => void) {
  let renderer: Promise<Renderer> | undefined;
  return async (message: unknown): Promise<void> => {
    if (message === 'ping') return reply('ready');
    if (!isRenderRequest(message)) return;
    try {
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
