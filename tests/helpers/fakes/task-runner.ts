import type { TaskResult, TaskRunner } from '../../../src/core/ports';

type Task = (input: unknown) => unknown;

/** Runs tasks inline; `hang` makes a task behave as if it overran its time budget. */
export class FakeTaskRunner implements TaskRunner {
  private readonly hanging = new Set<string>();

  constructor(private readonly tasks: Record<string, Task>) {}

  hang(task: string): void {
    this.hanging.add(task);
  }

  async run<T>(task: string, input: unknown, _options?: { timeoutMs: number }): Promise<TaskResult<T>> {
    const fn = this.tasks[task];
    if (!fn) throw new Error(`FakeTaskRunner: unknown task ${task}`);
    if (this.hanging.has(task)) return { ok: false, reason: 'timeout' };
    try {
      return { ok: true, value: fn(input) as T };
    } catch (error) {
      return { ok: false, reason: 'error', message: error instanceof Error ? error.message : String(error) };
    }
  }
}
