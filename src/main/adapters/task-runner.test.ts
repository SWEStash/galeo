import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkerThreadTaskRunner } from './task-runner';

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
});
