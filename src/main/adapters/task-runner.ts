import { Worker } from 'node:worker_threads';
import type { TaskResult, TaskRunner } from '../../core/ports';

type Reply = { id: number; ok: true; value: unknown } | { id: number; ok: false; message: string };

interface Pending {
  resolve: (result: TaskResult<unknown>) => void;
  timer: NodeJS.Timeout;
}

/**
 * Runs core tasks in a Node worker thread (ADR-004). A task that overruns its budget is not
 * awaited: the worker is terminated and a fresh one starts with the next task, so no input can
 * stall the main process.
 */
export class WorkerThreadTaskRunner implements TaskRunner {
  private worker: Worker | null = null;
  private nextId = 0;
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly script: string) {}

  run<T>(task: string, input: unknown, { timeoutMs }: { timeoutMs: number }): Promise<TaskResult<T>> {
    const worker = this.ensureWorker();
    const id = ++this.nextId;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.settle(id, { ok: false, reason: 'timeout' });
        this.restart(worker, 'a task overran its time budget');
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as Pending['resolve'], timer });
      worker.postMessage({ id, task, input });
    });
  }

  async close(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    await worker?.terminate();
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(this.script);
    worker.on('message', (reply: Reply) =>
      this.settle(reply.id, reply.ok ? { ok: true, value: reply.value } : { ok: false, reason: 'error', message: reply.message }),
    );
    worker.on('error', (error) => this.restart(worker, error.message));
    worker.on('exit', (code) => this.restart(worker, `the task worker exited (${code})`));
    this.worker = worker;
    return worker;
  }

  /** Drops `worker` and fails whatever it still owed; the next task starts a new worker. */
  private restart(worker: Worker, message: string): void {
    if (this.worker !== worker) return;
    this.worker = null;
    void worker.terminate();
    for (const id of [...this.pending.keys()]) this.settle(id, { ok: false, reason: 'error', message });
  }

  private settle(id: number, result: TaskResult<unknown>): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    pending.resolve(result);
  }
}
