import { CHANNELS, type GaleoApi, type Channel } from './ipc';

export type Invoke = (channel: Channel, args: unknown[]) => Promise<unknown>;

/** Builds `window.galeo` with one method per channel, each bound to its own channel name. */
export function buildApi(invoke: Invoke): GaleoApi {
  const api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>> = {};
  for (const channel of CHANNELS) {
    const [group, method] = channel.split('.') as [string, string];
    (api[group] ??= {})[method] = (...args) => invoke(channel, args);
  }
  return api as GaleoApi;
}
