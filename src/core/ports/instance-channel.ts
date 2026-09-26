import type { Unsubscribe } from './common';

/**
 * A request to open files or focus the app: the first launch, a later launch forwarded to this
 * instance, or (macOS) an `open-file` event. `argv` holds only the app's own arguments.
 */
export interface OpenRequest {
  source: 'launch' | 'second-instance' | 'open-file';
  argv: readonly string[];
  cwd: string;
}

export interface InstanceChannel {
  /** Takes the single-instance lock; false when another instance already holds it. */
  acquire(): boolean;
  onOpenRequest(listener: (request: OpenRequest) => void): Unsubscribe;
}
