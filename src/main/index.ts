import { app, BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { parseArgv } from '../core/argv';
import { readDocument } from '../core/documents/read';
import { DocumentRecords } from '../core/documents/records';
import { startupMode, type StartupMode } from '../core/startup';
import { resolveAppPaths } from './adapters/app-paths';
import { NodeFileSystem } from './adapters/file-system';
import { ElectronInstanceChannel } from './adapters/instance-channel';
import { installAppLifecycle } from './adapters/lifecycle';
import { decodeWithPlatform } from './adapters/text-decoder';
import { registerIpc } from './ipc/register';
import { perfMark, reportColdStart } from './perf';
import { registerAppProtocol, registerSchemes } from './protocol/register';
import { devServerOrigin, rendererUrl, trustedOrigins } from './renderer-entry';
import { hardenWebContents } from './security/harden';
import { installNetworkGuard, lockDownBackgroundNetworking } from './security/network-guard';
import { appResponseHeaders, hostResolverRules, networkLockdown } from './security/network-policy';
import { createAppWindow } from './window/factory';
import { ownArgs } from './window/policy';

// Node's uptime starts with the process, before any of this module runs.
perfMark('process-start', Date.now() - process.uptime() * 1000);

const runtime = { isPackaged: app.isPackaged, env: process.env };
// Fixed at process start: a forwarded launch or page content can't change it (ADR-008).
const sandboxed = !app.commandLine.hasSwitch('no-sandbox');

const launch = { argv: ownArgs(process.argv, { defaultApp: Boolean(process.defaultApp) }), cwd: process.cwd() };
const parsed = parseArgv(launch.argv, {
  cwd: launch.cwd,
  forwarded: false,
  resolve: (cwd, file) => path.resolve(cwd, file),
});

// Chromium's own data follows the app's directories (ADR-005). This must happen before the
// single-instance lock, which lives in `userData`.
const paths = resolveAppPaths({
  platform: process.platform,
  env: process.env,
  home: app.getPath('home'),
  appData: app.getPath('appData'),
});
app.setPath('userData', path.join(paths.stateDir, 'chromium'));
app.setPath('sessionData', paths.cacheDir);

const instance = new ElectronInstanceChannel(app, launch);

if (!parsed.ok) {
  process.stderr.write(`galeo: ${parsed.error}\n`);
  app.exit(2);
} else if (!instance.acquire()) {
  // Another instance runs: it received these arguments with the lock request.
  app.quit();
} else {
  start(startupMode(parsed.args, { sandboxed }), parsed.args.files);
}

function start(initialMode: StartupMode, files: readonly string[]): void {
  let mode = initialMode;
  let choiceWindow: BrowserWindow | undefined;
  const documents = new DocumentRecords(randomUUID);
  const fs = new NodeFileSystem();
  // The launch's files open in the first main window; later launches are routed by the router.
  let pendingFiles = [...files];

  const lockdown = networkLockdown(runtime);
  registerSchemes();
  lockDownBackgroundNetworking(lockdown.resolver ? hostResolverRules(devServerOrigin(runtime)) : null);

  const openMainWindow = () => {
    const window = createAppWindow({ url: rendererUrl(runtime), sandboxed });
    const windowId = window.webContents.id;
    for (const file of pendingFiles) documents.open(file, windowId);
    pendingFiles = [];
    window.on('closed', () => documents.closeWindow(windowId));
    perfMark('window-created');
    reportColdStart(window);
  };

  void app.whenReady().then(() => {
    perfMark('app-ready');
    hardenWebContents();
    if (lockdown.guard) {
      installNetworkGuard(
        { devServerOrigin: devServerOrigin(runtime), allowDevTools: !app.isPackaged },
        recordBlockedRequest,
      );
    }
    registerAppProtocol(path.join(import.meta.dirname, '../renderer'), appResponseHeaders(runtime));
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
        'documents.list': (_args, event) => documents.list(event.sender.id),
        'documents.read': ([id], event) => {
          const record = documents.get(id, event.sender.id);
          if (!record) throw new Error('unknown document');
          return readDocument(record.path, { fs, decode: decodeWithPlatform });
        },
      },
      trustedOrigins(runtime),
    );
    if (mode.kind === 'sandbox-unavailable') {
      choiceWindow = createAppWindow({ url: rendererUrl(runtime), sandboxed, dialog: true });
    } else {
      openMainWindow();
    }

    const openMainWindowIfNone = () => {
      if (mode.kind === 'normal' && BrowserWindow.getAllWindows().length === 0) openMainWindow();
    };
    // Routing files to profiles and windows arrives with the router; until then a later launch
    // only brings back a window when none is open (macOS keeps running without one).
    instance.onOpenRequest(openMainWindowIfNone);
    installAppLifecycle(app, {
      platform: process.platform,
      windowCount: () => BrowserWindow.getAllWindows().length,
      openWindow: openMainWindowIfNone,
    });
  });
}

/**
 * Cancelled requests, readable by end-to-end tests from the main process as
 * `globalThis.__galeoBlockedRequests`. Unpackaged builds only.
 */
function recordBlockedRequest(url: string): void {
  if (app.isPackaged) return;
  const global = globalThis as { __galeoBlockedRequests?: string[] };
  (global.__galeoBlockedRequests ??= []).push(url);
}
