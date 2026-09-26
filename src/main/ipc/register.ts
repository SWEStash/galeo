import { app, ipcMain } from 'electron';
import type { Channel, Requests, Responses } from '../../shared/contracts';
import { createHandler, type IpcEvent } from './handle';
import { requestSchemas } from './schemas';

type Handlers = { [C in Channel]: (args: Requests[C], event: IpcEvent) => Responses[C] | Promise<Responses[C]> };

const handlers: Handlers = {
  'app.info': () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    sandboxed: !app.commandLine.hasSwitch('no-sandbox'),
  }),
};

/** Registers every IPC handler behind the sender check and its schema. */
export function registerIpc(trustedOrigins: ReadonlySet<string>): void {
  for (const channel of Object.keys(handlers) as Channel[]) {
    ipcMain.handle(
      channel,
      createHandler({ channel, schema: requestSchemas[channel], trustedOrigins, handle: handlers[channel] }),
    );
  }
}
