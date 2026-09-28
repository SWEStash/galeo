import type { EventName, Events } from '../../shared/contracts';

/** Sends one of the contract's events to a window's page (main → renderer, ADR-007). */
export function sendEvent<E extends EventName>(
  contents: { isDestroyed(): boolean; send(channel: string, payload: unknown): void },
  event: E,
  payload: Events[E],
): void {
  if (!contents.isDestroyed()) contents.send(event, payload);
}
