import { Worker } from 'node:worker_threads';
import type { TaskResult, TaskRunner } from '../../core/ports';

type Reply = { id: number; ok: true; value: unknown } | { id: number; ok: false; message: string };

interface Job {
  id: number;
  task: string;
  input: unknown;
  timeoutMs: number;
  resolve: (result: TaskResult<unknown>) => void;
}

/**
 * Runs core tasks in a Node worker thread (ADR-004), one at a time. A task's budget starts when
 * it is dispatched; one that overruns is not awaited: the worker is terminated and a fresh one
 * runs the rest of the queue, so no input can stall the main process or fail other tasks.
 */
export class WorkerThreadTaskRunner implements TaskRunner {
  private worker: Worker | null = null;
  private nextId = 0;
  private readonly queue: Job[] = [];
  private running: { job: Job; timer: NodeJS.Timeout } | null = null;

  constructor(private readonly script: string) {}

  run<T>(task: string, input: unknown, { timeoutMs }: { timeoutMs: number }): Promise<TaskResult<T>> {
    return new Promise((resolve) => {
      this.queue.push({ id: ++this.nextId, task, input, timeoutMs, resolve: resolve as Job['resolve'] });
      this.dispatch();
    });
  }

  async close(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    await worker?.terminate();
  }

  private dispatch(): void {
    if (this.running) return;
    const job = this.queue.shift();
    if (!job) return;
    const worker = this.ensureWorker();
    const timer = setTimeout(() => this.fail(worker, { ok: false, reason: 'timeout' }), job.timeoutMs);
    this.running = { job, timer };
    worker.postMessage({ id: job.id, task: job.task, input: job.input });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(this.script);
    worker.on('message', (reply: Reply) => {
      if (this.running?.job.id !== reply.id) return;
      this.finish(reply.ok ? { ok: true, value: reply.value } : { ok: false, reason: 'error', message: reply.message });
    });
    worker.on('error', (error) => this.fail(worker, { ok: false, reason: 'error', message: error.message }));
    worker.on('exit', (code) => this.fail(worker, { ok: false, reason: 'error', message: `the task worker exited (${code})` }));
    this.worker = worker;
    return worker;
  }

  /** The running task ends with `result`; the next one starts. */
  private finish(result: TaskResult<unknown>): void {
    const running = this.running;
    if (!running) return;
    clearTimeout(running.timer);
    this.running = null;
    running.job.resolve(result);
    this.dispatch();
  }

  /** `worker` can't go on (overran or died): it is dropped, and only its running task fails. */
  private fail(worker: Worker, result: TaskResult<unknown>): void {
    if (this.worker !== worker) return;
    this.worker = null;
    void worker.terminate();
    this.finish(result);
  }
}
