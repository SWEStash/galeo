import type { CsvParse, Separator } from '../../shared/csv';
import type { WorkerFormat } from '../../shared/formats';
import type { JsonParse } from '../../shared/json-index';
import type { RenderRequest, WorkerReply } from './handler';
import type { RenderResult } from './pipeline/render';

/** The part of `Worker` the client uses. */
interface WorkerPort extends EventTarget {
  postMessage(message: RenderRequest): void;
  terminate(): void;
}

export interface RenderClient {
  /**
   * `budgetMs` replaces the usual budget, for a render the reader asked to wait for. `live`: a
   * preview of typing (ADR-014), which skips the cache; while one is with the worker, a newer one
   * waits and replaces any already waiting, which is refused with `RenderSuperseded`. `signal`: the
   * reader cancelled (ADR-020), refused with `RenderCancelled`.
   */
  markdown(text: string, options?: { budgetMs?: number; live?: boolean; format?: WorkerFormat; signal?: AbortSignal }): Promise<RenderResult>;
  /** Reads a CSV/TSV table, on the same terms as `markdown`. */
  table(text: string, options: { separator: Separator | 'sniff'; budgetMs?: number; live?: boolean; signal?: AbortSignal }): Promise<CsvParse>;
  /** Indexes a JSON document for the tree, on the same terms as `markdown`. */
  json(text: string, options?: { budgetMs?: number; signal?: AbortSignal }): Promise<JsonParse>;
  /** Stops the worker (the window is going away). */
  dispose(): void;
}

/** How long one render may take once it is the oldest waiting before its worker is replaced (SR-14). */
export const RENDER_BUDGET_MS = 2000;

/** The budget of a render the reader asked for ("Render anyway"): long, but still bounded. */
export const RENDER_ANYWAY_BUDGET_MS = 60_000;

/** A CSV/TSV table's budget (ADR-020): a big dataset is expected to take a few seconds. */
export const TABLE_BUDGET_MS = 30_000;

/** A render refused for running over its budget (the document is too slow, not broken). */
export class RenderTimeout extends Error {
  constructor(budgetMs: number) {
    super(`Rendering took too long (over ${budgetMs / 1000} s)`);
    this.name = 'RenderTimeout';
  }
}

/** A live render replaced by newer text before the worker started it. */
export class RenderSuperseded extends Error {
  constructor() {
    super('A newer text replaced this render');
    this.name = 'RenderSuperseded';
  }
}

/** A render the reader cancelled (ADR-020). */
export class RenderCancelled extends Error {
  constructor() {
    super('Rendering cancelled');
    this.name = 'RenderCancelled';
  }
}

/** A render refused for a syntax error (MDX is strict), at `line` of the text. */
export class RenderSyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
    this.name = 'RenderSyntaxError';
  }
}

/** A job as sent, without its id (`send` adds it, also when a fresh worker gets it again). */
type Job = RenderRequest extends infer Request ? (Request extends RenderRequest ? Omit<Request, 'id'> : never) : never;

interface Pending {
  job: Job;
  budgetMs: number;
  live: boolean;
  resolve: (result: RenderResult | CsvParse | JsonParse) => void;
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
  // The live render with the worker, and the newest one waiting for it to be done.
  let liveSent: number | null = null;
  let liveWaiting: ({ id: number } & Pending) | null = null;
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
      if (reply.type === 'failed') request.reject(reply.line === undefined ? new Error(reply.message) : new RenderSyntaxError(reply.message, reply.line));
      else request.resolve(reply.result);
      releaseLive(reply.id);
      watchOldest();
    });
    return started;
  }

  function send(id: number, { job }: Pending) {
    worker.postMessage({ ...job, id });
  }

  function dispatch(id: number, request: Pending) {
    pending.set(id, request);
    send(id, request);
    if (request.live) liveSent = id;
    if (pending.size === 1) watchOldest();
  }

  /** The worker is done with `id`: if it was the live render, the newest waiting one goes next. */
  function releaseLive(id: number) {
    if (id !== liveSent) return;
    liveSent = null;
    const next = liveWaiting;
    liveWaiting = null;
    if (next) dispatch(next.id, next);
  }

  /** Gives the oldest request waiting a fresh budget. */
  function watchOldest() {
    clearTimeout(timer);
    const oldest = pending.keys().next();
    timer = oldest.done ? undefined : setTimeout(() => overBudget(oldest.value), pending.get(oldest.value)!.budgetMs);
  }

  function overBudget(id: number) {
    replaceWorker(id, new RenderTimeout(pending.get(id)!.budgetMs));
  }

  /** Refuses the request the worker is on and replaces the worker; the fresh one gets the rest. */
  function replaceWorker(id: number, error: Error) {
    const request = pending.get(id)!;
    pending.delete(id);
    request.reject(error);
    worker.terminate();
    worker = start();
    for (const [waiting, each] of pending) send(waiting, each);
    releaseLive(id);
    watchOldest();
  }

  /**
   * The reader cancelled `id`: the request the worker is on costs a fresh worker (ADR-020); one
   * still waiting is dropped (the worker may still work it, its answer goes nowhere).
   */
  function cancel(id: number) {
    if (liveWaiting?.id === id) {
      liveWaiting.reject(new RenderCancelled());
      liveWaiting = null;
      return;
    }
    const request = pending.get(id);
    if (!request) return;
    if (pending.keys().next().value === id) return replaceWorker(id, new RenderCancelled());
    pending.delete(id);
    request.reject(new RenderCancelled());
    releaseLive(id);
  }

  /** Sends `job`, or holds it as the live render waiting its turn. `Result` is what its kind answers. */
  function submit<Result extends RenderResult | CsvParse | JsonParse>(job: Job, budgetMs: number, live: boolean, signal?: AbortSignal): Promise<Result> {
    const id = ++nextId;
    return new Promise<Result>((resolveResult, rejectResult) => {
      if (signal?.aborted) return rejectResult(new RenderCancelled());
      const onAbort = () => cancel(id);
      signal?.addEventListener('abort', onAbort, { once: true });
      const settled = () => signal?.removeEventListener('abort', onAbort);
      const resolve = (result: Result) => (settled(), resolveResult(result));
      const reject = (error: Error) => (settled(), rejectResult(error));
      const request = { job, budgetMs, live, resolve: resolve as Pending['resolve'], reject };
      if (live && liveSent !== null) {
        liveWaiting?.reject(new RenderSuperseded());
        liveWaiting = { id, ...request };
        return;
      }
      dispatch(id, request);
    });
  }

  const noCache = (live: boolean) => (live ? { noCache: true as const } : {});

  return {
    markdown(text, { budgetMs = RENDER_BUDGET_MS, live = false, format = 'markdown', signal } = {}) {
      return submit({ type: 'render', kind: 'article', format, text, ...noCache(live) }, budgetMs, live, signal);
    },
    table(text, { separator, budgetMs = RENDER_BUDGET_MS, live = false, signal }) {
      return submit({ type: 'render', kind: 'table', separator, text }, budgetMs, live, signal);
    },
    json(text, { budgetMs = RENDER_BUDGET_MS, signal } = {}) {
      return submit({ type: 'render', kind: 'json', text }, budgetMs, false, signal);
    },
    dispose() {
      clearTimeout(timer);
      worker.terminate();
    },
  };
}
