import { ipcMain } from 'electron';
import type { AnyChannel, Requests, Responses } from '../../shared/contracts';
import { requestSchemas } from '../../shared/contracts/schemas';
import { createHandler, type IpcEvent } from './handle';
import { keysOf } from '../../shared/records';

/** An IPC event with its sending window's web contents, whose id scopes per-window state. */
export type WindowIpcEvent = IpcEvent & { sender: { id: number } };

export type Handlers = {
  [C in AnyChannel]: (args: Requests[C], event: WindowIpcEvent) => Responses[C] | Promise<Responses[C]>;
};

/** Registers every IPC handler behind the sender check and its schema. */
export function registerIpc(handlers: Handlers, trustedOrigins: ReadonlySet<string>): void {
  const register = <C extends AnyChannel>(channel: C) =>
    ipcMain.handle(
      channel,
      createHandler<Requests[C], Responses[C], WindowIpcEvent>({
        channel,
        schema: requestSchemas[channel],
        trustedOrigins,
        handle: handlers[channel],
      }),
    );
  for (const channel of keysOf(handlers)) register(channel);
}
