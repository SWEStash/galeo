import { UNKNOWN_DOCUMENT } from '../../shared/documents';

/**
 * Whether a request failed because main no longer has the tab: it closed, or moved to another
 * window, while the request was in flight. There's nothing left to show the answer in.
 */
export function isClosedTab(error: unknown): boolean {
  return error instanceof Error && error.message.endsWith(`Error: ${UNKNOWN_DOCUMENT}`);
}

/** A failure handler that says `message`, unless the failure is only that the tab closed. */
export function unlessClosed(say: (message: string) => void, message: string): (error: unknown) => void {
  return (error) => {
    if (!isClosedTab(error)) say(message);
  };
}

/** A failure handler that says `message`: the reader asked for something main couldn't do. */
export function reportFailure(say: (message: string) => void, message: string): (error: unknown) => void {
  return () => say(message);
}

/** For a request nobody waits on (a report to main, a cancel): there's no one to tell, so it's logged. */
export function logFailure(what: string): (error: unknown) => void {
  return (error) => console.warn(`galeo: ${what} failed`, error);
}

/** For a request whose failure the reader sees anyway (a dragged tab that doesn't move). */
export function ignoreFailure(): void {}
