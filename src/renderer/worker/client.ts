import type { RenderRequest, WorkerReply } from './handler';
import type { RenderResult } from './pipeline/render';

/** The part of `Worker` the client uses. */
export interface WorkerPort extends EventTarget {
  postMessage(message: RenderRequest): void;
  terminate(): void;
}

export interface RenderClient {
  /** `budgetMs` replaces the usual budget, for a render the reader asked to wait for. */
  markdown(text: string, options?: { budgetMs?: number }): Promise<RenderResult>;
  /** Stops the worker (the window is going away). */
  dispose(): void;
}

/** How long one render may take once it is the oldest waiting before its worker is replaced (SR-14). */
export const RENDER_BUDGET_MS = 2000;

/** The budget of a render the reader asked for ("Render anyway"): long, but still bounded. */
export const RENDER_ANYWAY_BUDGET_MS = 60_000;

/** A render refused for running over its budget (the document is too slow, not broken). */
export class RenderTimeout extends Error {
  constructor(budgetMs: number) {
    super(`Rendering took too long (over ${budgetMs / 1000} s)`);
    this.name = 'RenderTimeout';
  }
}

interface Pending {
  text: string;
  budgetMs: number;
  resolve: (result: RenderResult) => void;
  reject: (error: Error) => void;
}

/**
 * Sends render requests to the window's worker and matches each reply to its request. The worker
 * works through them in turn, so the oldest request waiting has the budget: past it, that request
 * is refused (the tab shows source) and the worker is replaced by a fresh one, which gets the
 * requests that were waiting behind it.
 */
export function createRenderClient(spawn: () => WorkerPort): RenderClient {
  let nextId = 0;
  // In the order sent: the first one is the one the worker is on.
  const pending = new Map<number, Pending>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let worker = start();

  function start(): WorkerPort {
    const started = spawn();
    started.addEventListener('message', (event) => {
      // A replaced worker may still answer; only the current one counts.
      if (started !== worker) return;
      const reply = (event as MessageEvent<WorkerReply | 'ready'>).data;
      if (typeof reply !== 'object' || reply === null) return;
      const request = pending.get(reply.id);
      if (!request) return;
      pending.delete(reply.id);
      if (reply.type === 'rendered') request.resolve(reply.result);
      else request.reject(new Error(reply.message));
      watchOldest();
    });
    return started;
  }

  function send(id: number, text: string) {
    worker.postMessage({ type: 'render', id, format: 'markdown', text });
  }

  /** Gives the oldest request waiting a fresh budget. */
  function watchOldest() {
    clearTimeout(timer);
    const oldest = pending.keys().next();
    timer = oldest.done ? undefined : setTimeout(() => overBudget(oldest.value), pending.get(oldest.value)!.budgetMs);
  }

  function overBudget(id: number) {
    const request = pending.get(id)!;
    pending.delete(id);
    request.reject(new RenderTimeout(request.budgetMs));
    worker.terminate();
    worker = start();
    for (const [waiting, { text }] of pending) send(waiting, text);
    watchOldest();
  }

  return {
    markdown(text, { budgetMs = RENDER_BUDGET_MS } = {}) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { text, budgetMs, resolve, reject });
        send(id, text);
        if (pending.size === 1) watchOldest();
      });
    },
    dispose() {
      clearTimeout(timer);
      worker.terminate();
    },
  };
}
