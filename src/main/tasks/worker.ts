// The task worker thread (ADR-004): runs parsing that main must never do on its own thread.
import { parentPort } from 'node:worker_threads';
import { findInTextTask } from '../../shared/find';
import { referencesTask } from '../../shared/markdown/references';
import { errorMessage } from '../../shared/errors';

const TASKS: Record<string, (input: unknown) => unknown> = {
  references: referencesTask,
  findInText: findInTextTask,
};

parentPort!.on('message', ({ id, task, input }: { id: number; task: string; input: unknown }) => {
  try {
    const run = TASKS[task];
    if (!run) throw new Error(`unknown task: ${task}`);
    parentPort!.postMessage({ id, ok: true, value: run(input) });
  } catch (error) {
    parentPort!.postMessage({ id, ok: false, message: errorMessage(error) });
  }
});
