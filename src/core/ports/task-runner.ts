export type TaskResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'timeout' }
  | { ok: false; reason: 'error'; message: string };

/** Runs a named core task off the main thread; overruns are terminated, never awaited. */
export interface TaskRunner {
  /** `transfer`: buffers in `input` handed to the worker without a copy; the caller can't use them after. */
  run<T>(task: string, input: unknown, options: { timeoutMs: number; transfer?: ArrayBuffer[] }): Promise<TaskResult<T>>;
}
