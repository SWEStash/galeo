import type { Renderer, RenderResult } from './pipeline/render';

/** Window → worker. Only Markdown has a worker renderer so far (ADR-003's format registry). */
export interface RenderRequest {
  type: 'render';
  id: number;
  format: 'markdown';
  text: string;
  /** A live preview's render: the cache is neither read nor filled. */
  noCache?: true;
}

/** Worker → window, matched to the request by `id`. */
export type WorkerReply =
  | { type: 'rendered'; id: number; result: RenderResult }
  | { type: 'failed'; id: number; message: string };

function isRenderRequest(message: unknown): message is RenderRequest {
  const m = message as Partial<RenderRequest> | null;
  return m?.type === 'render' && typeof m.id === 'number' && m.format === 'markdown' && typeof m.text === 'string';
}

/** The worker's message loop, apart from `self` so it can be tested directly. */
export function createMessageHandler(renderer: Renderer, reply: (message: WorkerReply | 'ready') => void) {
  return async (message: unknown): Promise<void> => {
    if (message === 'ping') return reply('ready');
    if (!isRenderRequest(message)) return;
    try {
      reply({ type: 'rendered', id: message.id, result: await renderer.markdown(message.text, { cache: message.noCache !== true }) });
    } catch (error) {
      reply({ type: 'failed', id: message.id, message: error instanceof Error ? error.message : String(error) });
    }
  };
}
