import { CHANNELS, EVENTS, type GaleoApi, type Channel, type EventName, type StartInfo } from './ipc';

export type Invoke = (channel: Channel, args: unknown[]) => Promise<unknown>;
/** Calls `listener` with each payload of `event` until the returned function is called. */
export type Subscribe = (event: EventName, listener: (payload: never) => void) => () => void;

type Method = (...args: never[]) => unknown;

/**
 * Builds `window.galeo`: one method per channel, each bound to its own channel name, and one
 * `on…` method per event, bound to its own event name. `app.startInfo` is the one value: what the
 * window's page needs to paint, from the window's creation.
 */
export function buildApi(invoke: Invoke, subscribe: Subscribe, startInfo: StartInfo | null = null): GaleoApi {
  const api: Record<string, Record<string, Method>> = {};
  for (const channel of CHANNELS) {
    const [group, method] = channel.split('.') as [string, string];
    (api[group] ??= {})[method] = (...args: unknown[]) => invoke(channel, args);
  }
  for (const event of EVENTS) {
    const [group, name] = event.split('.') as [string, string];
    (api[group] ??= {})[`on${name[0]!.toUpperCase()}${name.slice(1)}`] = (listener: (payload: never) => void) =>
      subscribe(event, listener);
  }
  return { ...api, app: { ...api['app'], startInfo } } as unknown as GaleoApi;
}
