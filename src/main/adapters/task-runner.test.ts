import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORKER_START_MS, WorkerThreadTaskRunner } from './task-runner';

// A worker speaking the task protocol, with tasks that echo, fail, spin forever or crash.
const WORKER = `
import { parentPort } from 'node:worker_threads';
const tasks = {
  echo: (input) => input,
  fail: () => { throw new Error('broken input'); },
  spin: () => { for (;;) {} },
  crash: () => process.exit(3),
};
parentPort.on('message', ({ id, task, input }) => {
  try {
    parentPort.postMessage({ id, ok: true, value: tasks[task](input) });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, message: error.message });
  }
});
`;

const dirs: string[] = [];
const runners: WorkerThreadTaskRunner[] = [];

function runner(): WorkerThreadTaskRunner {
  const dir = mkdtempSync(path.join(tmpdir(), 'galeo-tasks-'));
  dirs.push(dir);
  const script = path.join(dir, 'worker.mjs');
  writeFileSync(script, WORKER);
  const created = new WorkerThreadTaskRunner(script);
  runners.push(created);
  return created;
}

afterEach(async () => {
  await Promise.all(runners.splice(0).map((r) => r.close()));
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('WorkerThreadTaskRunner', () => {
  it('runs a task in a worker thread and returns its value', async () => {
    expect(await runner().run('echo', { a: [1, 2] }, { timeoutMs: 5000 })).toEqual({ ok: true, value: { a: [1, 2] } });
  });

  it('matches concurrent results to their tasks', async () => {
    const tasks = runner();
    const results = await Promise.all([1, 2, 3].map((n) => tasks.run('echo', n, { timeoutMs: 5000 })));
    expect(results).toEqual([1, 2, 3].map((value) => ({ ok: true, value })));
  });

  it('reports a task that throws', async () => {
    expect(await runner().run('fail', null, { timeoutMs: 5000 })).toEqual({
      ok: false,
      reason: 'error',
      message: 'broken input',
    });
  });

  it('terminates an overrunning task and starts a fresh worker for the next one', async () => {
    const tasks = runner();
    const started = Date.now();
    expect(await tasks.run('spin', null, { timeoutMs: 200 })).toEqual({ ok: false, reason: 'timeout' });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(await tasks.run('echo', 'after', { timeoutMs: 5000 })).toEqual({ ok: true, value: 'after' });
  });

  it('fails the pending tasks of a worker that dies, and recovers', async () => {
    const tasks = runner();
    expect(await tasks.run('crash', null, { timeoutMs: 5000 })).toMatchObject({ ok: false, reason: 'error' });
    expect(await tasks.run('echo', 'again', { timeoutMs: 5000 })).toEqual({ ok: true, value: 'again' });
  });

  it('runs a task queued behind an overrunning one, in a fresh worker, with its own full budget', async () => {
    const tasks = runner();
    const [spun, echoed] = await Promise.all([
      tasks.run('spin', null, { timeoutMs: 300 }),
      // Its budget is shorter than the time it waits in the queue: it only starts when dispatched.
      tasks.run('echo', 'queued', { timeoutMs: 250 }),
    ]);
    expect(spun).toEqual({ ok: false, reason: 'timeout' });
    expect(echoed).toEqual({ ok: true, value: 'queued' });
  });

  it('fails only the task a dying worker was running', async () => {
    const tasks = runner();
    const [crashed, echoed] = await Promise.all([
      tasks.run('crash', null, { timeoutMs: 5000 }),
      tasks.run('echo', 'survives', { timeoutMs: 5000 }),
    ]);
    expect(crashed).toMatchObject({ ok: false, reason: 'error' });
    expect(echoed).toEqual({ ok: true, value: 'survives' });
  });

  describe('a worker slow to start (a loaded machine)', () => {
    /** A worker that comes online only when told, and echoes once it is. */
    class SlowWorker extends EventEmitter {
      online = false;
      postMessage(message: { id: number; input: unknown }) {
        const reply = () => this.emit('message', { id: message.id, ok: true, value: message.input });
        if (this.online) setTimeout(reply, 10);
        else this.once('online', () => setTimeout(reply, 10));
      }
      start() {
        this.online = true;
        this.emit('online');
      }
      async terminate() {
        return 0;
      }
    }

    it("doesn't spend a task's budget on the worker starting", async () => {
      vi.useFakeTimers();
      try {
        let worker: SlowWorker | undefined;
        const tasks = new WorkerThreadTaskRunner('unused', () => (worker = new SlowWorker()) as unknown as Worker);
        const result = tasks.run('echo', 'late', { timeoutMs: 100 });
        await vi.advanceTimersByTimeAsync(500);
        worker!.start();
        await vi.advanceTimersByTimeAsync(20);
        expect(await result).toEqual({ ok: true, value: 'late' });
      } finally {
        vi.useRealTimers();
      }
    });

    it('gives up on a worker that never starts, and starts a fresh one for the next task', async () => {
      vi.useFakeTimers();
      try {
        const workers: SlowWorker[] = [];
        const tasks = new WorkerThreadTaskRunner('unused', () => (workers.push(new SlowWorker()), workers.at(-1)) as unknown as Worker);
        const stuck = tasks.run('echo', 'stuck', { timeoutMs: 100 });
        await vi.advanceTimersByTimeAsync(WORKER_START_MS);
        expect(await stuck).toEqual({ ok: false, reason: 'error', message: "the task worker didn't start" });
        const next = tasks.run('echo', 'next', { timeoutMs: 100 });
        workers[1]!.start();
        await vi.advanceTimersByTimeAsync(20);
        expect(await next).toEqual({ ok: true, value: 'next' });
      } finally {
        vi.useRealTimers();
      }
    });

    it('still times out a task that overruns once the worker is up', async () => {
      vi.useFakeTimers();
      try {
        // Up, but the task never answers.
        class Spinning extends SlowWorker {
          override postMessage() {}
        }
        let worker: SlowWorker | undefined;
        const tasks = new WorkerThreadTaskRunner('unused', () => (worker = new Spinning()) as unknown as Worker);
        const result = tasks.run('spin', null, { timeoutMs: 100 });
        worker!.start();
        await vi.advanceTimersByTimeAsync(99);
        expect(await Promise.race([result, 'running'])).toBe('running');
        await vi.advanceTimersByTimeAsync(100);
        expect(await result).toEqual({ ok: false, reason: 'timeout' });
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
