import type { RenderRequest, WorkerReply } from './handler';
import type { RenderResult } from './pipeline/render';

/** The part of `Worker` the client uses. */
export interface WorkerPort extends EventTarget {
  postMessage(message: RenderRequest): void;
}

export interface RenderClient {
  markdown(text: string): Promise<RenderResult>;
}

/** Sends render requests to the window's worker and matches each reply to its request. */
export function createRenderClient(worker: WorkerPort): RenderClient {
  let nextId = 0;
  const pending = new Map<number, { resolve: (result: RenderResult) => void; reject: (error: Error) => void }>();

  worker.addEventListener('message', (event) => {
    const reply = (event as MessageEvent<WorkerReply | 'ready'>).data;
    if (typeof reply !== 'object' || reply === null) return;
    const request = pending.get(reply.id);
    if (!request) return;
    pending.delete(reply.id);
    if (reply.type === 'rendered') request.resolve(reply.result);
    else request.reject(new Error(reply.message));
  });

  return {
    markdown(text) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ type: 'render', id, format: 'markdown', text });
      });
    },
  };
}
