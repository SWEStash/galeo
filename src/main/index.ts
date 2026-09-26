import { app, type BrowserWindow } from 'electron';
import path from 'node:path';
import { parseArgv } from '../core/argv';
import { startupMode, type StartupMode } from '../core/startup';
import { registerIpc } from './ipc/register';
import { registerAppProtocol, registerSchemes } from './protocol/register';
import { rendererUrl, trustedOrigins } from './renderer-entry';
import { hardenWebContents } from './security/harden';
import { createAppWindow } from './window/factory';
import { ownArgs } from './window/policy';

const runtime = { isPackaged: app.isPackaged, env: process.env };
// Fixed at process start: a forwarded launch or page content can't change it (ADR-008).
const sandboxed = !app.commandLine.hasSwitch('no-sandbox');

const parsed = parseArgv(ownArgs(process.argv, { defaultApp: Boolean(process.defaultApp) }), {
  cwd: process.cwd(),
  forwarded: false,
  resolve: (cwd, file) => path.resolve(cwd, file),
});
if (!parsed.ok) {
  process.stderr.write(`galeo: ${parsed.error}\n`);
  app.exit(2);
} else {
  start(startupMode(parsed.args, { sandboxed }));
}

function start(initialMode: StartupMode): void {
  let mode = initialMode;
  let choiceWindow: BrowserWindow | undefined;

  registerSchemes();

  const openMainWindow = () => createAppWindow({ url: rendererUrl(runtime), sandboxed });

  void app.whenReady().then(() => {
    hardenWebContents();
    registerAppProtocol(path.join(import.meta.dirname, '../renderer'));
    registerIpc(
      {
        'app.info': () => ({
          name: app.getName(),
          version: app.getVersion(),
          platform: process.platform,
          sandboxed,
          sandboxUnavailable: mode.kind === 'sandbox-unavailable' ? mode.cause : null,
        }),
        'app.resolveSandboxUnavailable': ([choice]) => {
          if (mode.kind !== 'sandbox-unavailable') throw new Error('sandbox choice not offered');
          if (choice === 'quit') {
            app.quit();
            return;
          }
          mode = { kind: 'normal' };
          openMainWindow();
          choiceWindow?.close();
        },
      },
      trustedOrigins(runtime),
    );
    if (mode.kind === 'sandbox-unavailable') {
      choiceWindow = createAppWindow({ url: rendererUrl(runtime), sandboxed, dialog: true });
    } else {
      openMainWindow();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
