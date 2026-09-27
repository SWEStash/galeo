import { ipcMain } from 'electron';
import type { Channel, Requests, Responses } from '../../shared/contracts';
import { requestSchemas } from '../../shared/contracts/schemas';
import { createHandler, type IpcEvent } from './handle';

/** An IPC event with its sending window's web contents, whose id scopes per-window state. */
export type WindowIpcEvent = IpcEvent & { sender: { id: number } };

export type Handlers = {
  [C in Channel]: (args: Requests[C], event: WindowIpcEvent) => Responses[C] | Promise<Responses[C]>;
};

/** Registers every IPC handler behind the sender check and its schema. */
export function registerIpc(handlers: Handlers, trustedOrigins: ReadonlySet<string>): void {
  const register = <C extends Channel>(channel: C) =>
    ipcMain.handle(
      channel,
      createHandler<Requests[C], Responses[C], WindowIpcEvent>({
        channel,
        schema: requestSchemas[channel],
        trustedOrigins,
        handle: handlers[channel],
      }),
    );
  for (const channel of Object.keys(handlers) as Channel[]) register(channel);
}
