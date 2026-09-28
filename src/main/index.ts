import { app, BrowserWindow, clipboard, dialog, Menu, nativeTheme, webContents } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { parseArgv } from '../core/argv';
import { ImageGrants } from '../core/documents/images';
import { ReadIdentities } from '../core/documents/identities';
import { DocumentLinks } from '../core/documents/links';
import { DocumentMenus } from '../core/documents/menus';
import { SelectionGrants } from '../core/documents/selections';
import { ExternalOpenLimiter } from '../core/links/limiter';
import { ProfileSettings } from '../core/settings/profile-settings';
import { SessionKeeper } from '../core/session/keeper';
import type { SessionFile, WindowBounds } from '../core/session/model';
import { RecentFiles } from '../core/session/recent';
import { SessionStore } from '../core/session/store';
import { WarmTabs } from '../core/tabs/lifecycle';
import { MemoryPressure } from '../core/tabs/pressure';
import { TabRegistry, type WindowState } from '../core/tabs/registry';
import type { OsShell } from '../core/ports';
import type { EventName, Events } from '../shared/contracts';
import type { Command } from '../shared/keymap';
import type { Settings, SettingsNotice } from '../shared/settings';
import { startupMode, type StartupMode } from '../core/startup';
import { createPrivateDirs, resolveAppPaths } from './adapters/app-paths';
import { NodeFileSystem } from './adapters/file-system';
import { NodeFileWatcher } from './adapters/file-watcher';
import { electronSystemMetrics } from './adapters/system-metrics';
import { ElectronInstanceChannel } from './adapters/instance-channel';
import { installAppLifecycle } from './adapters/lifecycle';
import { systemClock } from './adapters/clock';
import { ElectronOsShell, RecordingOsShell } from './adapters/os-shell';
import { WorkerThreadTaskRunner } from './adapters/task-runner';
import { decodeWithPlatform } from './adapters/text-decoder';
import { utf8 } from './adapters/utf8';
import { documentHandlers } from './documents/handlers';
import { registerIpc } from './ipc/register';
import { sendEvent } from './ipc/send';
import { perfMark, reportColdStart } from './perf';
import { serveImage } from './protocol/file-images';
import { recentHandlers } from './session/recent-handlers';
import { parseRecentFiles, parseSession } from './session/schemas';
import { parseGlobalSettings, parseProfileFile } from './settings/schemas';
import { registerAppProtocol, registerSchemes } from './protocol/register';
import { devServerOrigin, rendererUrl, trustedOrigins } from './renderer-entry';
import { hardenWebContents } from './security/harden';
import { installNetworkGuard, lockDownBackgroundNetworking } from './security/network-guard';
import { appResponseHeaders, hostResolverRules, networkLockdown } from './security/network-policy';
import { tabHandlers } from './tabs/handlers';
import { createAppWindow, windowBounds } from './window/factory';
import { applicationMenu } from './window/menu';
import { keymapPlatform } from './window/policy';
import { showNativeMenu } from './window/native-menu';
import { ownArgs } from './window/policy';

const MIB = 1024 * 1024;
/** How often each window's renderer memory is sampled for pressure demotion. */
const PRESSURE_INTERVAL_MS = 30_000;
/**
 * A window's renderer above this is under pressure. Generous until the performance pass sets it
 * from the measured baseline plus headroom (ADR-002): it should catch runaway documents only.
 */
const PRESSURE_THRESHOLD_BYTES = 1536 * MIB;

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
createPrivateDirs(paths);
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
  // Every change to a window's tabs goes to its page as a fresh snapshot (ADR-002).
  const pushSnapshot = (windowId: number) => {
    const contents = webContents.fromId(windowId);
    if (contents) sendEvent(contents, 'tabs.changed', documents.snapshot(windowId));
  };
  const documents = new TabRegistry(randomUUID, (windowId) => {
    pushSnapshot(windowId);
    sessions.changed();
  });
  const fs = new NodeFileSystem();
  const images = new ImageGrants(randomUUID);
  const shell = externalShell();
  const menus = new DocumentMenus({
    tabs: documents,
    fs,
    shell,
    clipboard,
    showMenu: (windowId, items) => showNativeMenu(windowId, items, app.isPackaged),
  });
  const links = new DocumentLinks({
    records: documents,
    fs,
    images,
    tasks: new WorkerThreadTaskRunner(path.join(import.meta.dirname, 'task-worker.js')),
    shell,
    limiter: new ExternalOpenLimiter(systemClock),
    confirmBurst,
    dirname: path.dirname,
    resolve: path.resolve,
    parseUrl: (href) => {
      try {
        const url = new URL(href);
        return { protocol: url.protocol, href: url.href };
      } catch {
        return null;
      }
    },
  });
  // Profiles arrive with the router; until then every window uses the default one.
  const settings = new ProfileSettings({
    fs,
    utf8,
    watcher: new NodeFileWatcher(),
    configDir: paths.configDir,
    profile: 'default',
    parseGlobal: parseGlobalSettings,
    parseProfile: parseProfileFile,
  });
  const broadcastSettings = () => {
    for (const window of BrowserWindow.getAllWindows()) {
      sendEvent(window.webContents, 'settings.changed', { settings: settings.current, notices: settings.notices });
    }
  };
  const warmLimits = (current: Settings) => ({ count: current.warmTabs, bytes: current.warmMegabytes * MIB });
  const warm = new WarmTabs(warmLimits(settings.current));
  const reads = new ReadIdentities(fs);
  const sendTo = <E extends EventName>(windowId: number, event: E, payload: Events[E]) => {
    const contents = webContents.fromId(windowId);
    if (contents) sendEvent(contents, event, payload);
  };
  const demote = (windowId: number, ids: string[]) => sendTo(windowId, 'tabs.demote', ids);
  // Memory pressure demotes one warm tab per sample, so a spike doesn't drop them all (ADR-002).
  const pressure = new MemoryPressure({
    clock: systemClock,
    metrics: electronSystemMetrics,
    intervalMs: PRESSURE_INTERVAL_MS,
    thresholdBytes: PRESSURE_THRESHOLD_BYTES,
    onPressure: (windowId) => {
      const ids = warm.pressure(windowId);
      if (ids.length > 0) demote(windowId, ids);
    },
  });
  settings.onChange((current) => {
    nativeTheme.themeSource = current.themeMode;
    for (const [windowId, ids] of warm.setLimits(warmLimits(current))) demote(windowId, ids);
    broadcastSettings();
  });
  settings.onNotices((notices) => {
    reportSettingsNotices(notices);
    broadcastSettings();
  });
  // Profiles arrive with the router; until then the session and recent files are the default profile's.
  const profileState = path.join(paths.stateDir, 'profiles', 'default');
  const sessionStore = new SessionStore({ fs, utf8, dir: profileState, parse: parseSession });
  const recent = new RecentFiles({ fs, utf8, path: path.join(profileState, 'recent.json'), parse: parseRecentFiles, now: Date.now });
  // Main windows in the order they opened, and their ids with the last focused first.
  const selections = new SelectionGrants(randomUUID);
  const mainWindows: BrowserWindow[] = [];
  let focusOrder: number[] = [];
  const sessions = new SessionKeeper({
    tabs: documents,
    clock: systemClock,
    save: (session) => sessionStore.save(session).catch((error: unknown) => console.warn('galeo: session not saved', error)),
    windows: () => mainWindows.map((window) => ({ id: window.webContents.id, bounds: windowBounds(window) })),
    focusOrder: () => focusOrder,
  });
  // The launch's files open in the last focused window; files from later launches aren't opened yet.
  let pendingFiles = [...files];

  const lockdown = networkLockdown(runtime);
  registerSchemes();
  lockDownBackgroundNetworking(lockdown.resolver ? hostResolverRules(devServerOrigin(runtime)) : null);

  const openMainWindow = ({ bounds = null, state, files: toOpen = [] }: { bounds?: WindowBounds | null; state?: WindowState; files?: readonly string[] } = {}) => {
    const window = createAppWindow({ url: rendererUrl(runtime), sandboxed, onCapabilityKey: recordCapabilityKey, bounds });
    const windowId = window.webContents.id;
    mainWindows.push(window);
    focusOrder = [...focusOrder, windowId];
    // A restored session's tabs come back hibernated: the page renders each when shown, the active first.
    if (state) documents.restoreWindow(windowId, state);
    for (const file of toOpen) documents.open(file, windowId);
    const followBounds = () => sessions.changed();
    window.on('move', followBounds);
    window.on('resize', followBounds);
    window.on('focus', () => {
      focusOrder = [windowId, ...focusOrder.filter((id) => id !== windowId)];
      sessions.changed();
      // A missing file that came back (or any file that changed) is read again (UX: missing recovers).
      for (const tab of documents.list(windowId)) {
        void reads.changed(tab.id, tab.path).then((changed) => changed && sendTo(windowId, 'tabs.stale', tab.id));
      }
    });
    window.on('close', () => {
      if (mainWindows.length === 1) sessions.holdForQuit();
    });
    window.on('closed', () => {
      mainWindows.splice(mainWindows.indexOf(window), 1);
      focusOrder = focusOrder.filter((id) => id !== windowId);
      for (const tab of documents.list(windowId)) {
        links.forget(tab.id);
        reads.forget(tab.id);
      }
      documents.closeWindow(windowId);
      warm.closeWindow(windowId);
      images.closeWindow(windowId);
      selections.closeWindow(windowId);
    });
    perfMark('window-created');
    reportColdStart(window, { document: toOpen.length > 0 || Boolean(state?.tabs.length) });
    return window;
  };

  /** A session's windows, the last focused opened last so it ends up in front. */
  const openSession = (session: SessionFile | null, launchFiles: readonly string[]) => {
    if (!session || session.windows.length === 0) return void openMainWindow({ files: launchFiles });
    const order = [...session.windows.keys()].sort((a, b) => rank(session, b) - rank(session, a));
    const opened = new Map(order.map((index) => [index, openMainWindow({ bounds: session.windows[index]!.bounds, state: session.windows[index]! })]));
    const front = opened.get(session.focusOrder[0] ?? order.at(-1)!)!;
    for (const file of launchFiles) documents.open(file, front.webContents.id);
  };

  // Saving is async; the quit waits for it once.
  let savedOnQuit = false;
  app.on('before-quit', (event) => {
    if (savedOnQuit) return;
    event.preventDefault();
    void sessions.flushOnQuit().finally(() => {
      savedOnQuit = true;
      app.quit();
    });
  });

  void app.whenReady().then(async () => {
    perfMark('app-ready');
    const menu = applicationMenu(process.platform);
    Menu.setApplicationMenu(menu && Menu.buildFromTemplate(menu));
    await settings.start();
    const loaded = await sessionStore.load();
    if (loaded.notice) reportSessionNotice(loaded.notice);
    await recent.load();
    nativeTheme.themeSource = settings.current.themeMode;
    warm.setLimits(warmLimits(settings.current));
    pressure.start();
    reportSettingsNotices(settings.notices);
    hardenWebContents();
    if (lockdown.guard) {
      installNetworkGuard(
        { devServerOrigin: devServerOrigin(runtime), allowDevTools: !app.isPackaged },
        recordBlockedRequest,
      );
    }
    registerAppProtocol(path.join(import.meta.dirname, '../renderer'), appResponseHeaders(runtime), (url) =>
      serveImage(url, { lookup: (id) => images.lookup(id), fs }),
    );
    registerIpc(
      {
        'app.info': () => ({
          name: app.getName(),
          version: app.getVersion(),
          platform: keymapPlatform(process.platform),
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
          openSession(loaded.session, pendingFiles);
          pendingFiles = [];
          choiceWindow?.close();
        },
        'settings.get': () => ({ settings: settings.current, notices: settings.notices }),
        'session.previous': () => sessionStore.previous(),
        'session.restorePrevious': async ([snapshot]) => {
          const previous = await sessionStore.readPrevious(snapshot);
          if (!previous) throw new Error('no such session');
          for (const window of previous.windows) openMainWindow({ bounds: window.bounds, state: window });
        },
        'documents.pathMenu': ([id], event) => menus.path(id, event.sender.id),
        'documents.contextMenu': ([id], event) => menus.document(id, event.sender.id),
        ...documentHandlers({
          records: documents,
          links,
          reads,
          fs,
          decode: decodeWithPlatform,
          opened: (file) => void recent.add(file).catch(() => {}),
        }),
        ...tabHandlers({
          tabs: documents,
          warm,
          reads,
          resync: pushSnapshot,
          closed: (id) => links.forget(id),
          demote,
          stale: (windowId, id) => sendTo(windowId, 'tabs.stale', id),
          positioned: () => sessions.changed(),
        }),
        ...recentHandlers({ recent, selections, tabs: documents }),
      },
      trustedOrigins(runtime),
    );
    if (mode.kind === 'sandbox-unavailable') {
      choiceWindow = createAppWindow({ url: rendererUrl(runtime), sandboxed, dialog: true });
    } else {
      openSession(loaded.session, pendingFiles);
      pendingFiles = [];
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
 * Config files galeo can't use are left untouched (SR-17). Until windows can show the notice,
 * main logs it; unpackaged test runs read the latest list as `globalThis.__galeoSettingsNotices`.
 */
function reportSettingsNotices(notices: readonly SettingsNotice[]): void {
  for (const notice of notices) console.warn(`galeo: ${notice.path} left untouched (${notice.reason}): ${notice.detail ?? ''}`);
  if (!app.isPackaged) (globalThis as { __galeoSettingsNotices?: readonly SettingsNotice[] }).__galeoSettingsNotices = notices;
}

/** How recently a session's window was focused: 0 for the last focused, higher for older ones. */
function rank(session: SessionFile, index: number): number {
  const at = session.focusOrder.indexOf(index);
  return at < 0 ? session.focusOrder.length + index : at;
}

/**
 * A session file galeo couldn't use was backed up and replaced by the newest valid snapshot
 * (SR-17). Logged; unpackaged test runs read `globalThis.__galeoSessionNotice`.
 */
function reportSessionNotice(notice: SettingsNotice): void {
  console.warn(`galeo: ${notice.path} was invalid (${notice.reason}); restored the newest valid snapshot`);
  if (!app.isPackaged) (globalThis as { __galeoSessionNotice?: SettingsNotice }).__galeoSessionNotice = notice;
}

/**
 * Capability keys main took before the page saw them. Edit mode (Ctrl+E) arrives in v0.2; until
 * then the key is only kept from the page. Unpackaged test runs read `globalThis.__galeoCapabilityKeys`.
 */
function recordCapabilityKey(command: Command): void {
  if (!app.isPackaged) ((globalThis as { __galeoCapabilityKeys?: Command[] }).__galeoCapabilityKeys ??= []).push(command);
}

/** Asks, in a native dialog the page can't answer for itself, whether a burst of opens may go on. */
async function confirmBurst(windowId: number): Promise<boolean> {
  const answer = !app.isPackaged ? process.env['GALEO_TEST_BURST_ANSWER'] : undefined;
  if (answer) return answer === 'allow';
  const contents = webContents.fromId(windowId);
  const owner = contents && BrowserWindow.fromWebContents(contents);
  const options = {
    type: 'question' as const,
    message: 'This document is opening many links. Allow?',
    buttons: ['Allow', 'Block for this tab'],
    defaultId: 1,
    cancelId: 1,
  };
  const { response } = owner ? await dialog.showMessageBox(owner, options) : await dialog.showMessageBox(options);
  return response === 0;
}

/**
 * The desktop hand-offs. Unpackaged test runs can record them instead of starting other apps
 * (`GALEO_TEST_EXTERNAL=record`, read as `globalThis.__galeoOpenedExternal`, `__galeoOpenedPaths` and
 * `__galeoRevealed`).
 */
function externalShell(): OsShell {
  if (app.isPackaged || process.env['GALEO_TEST_EXTERNAL'] !== 'record') return new ElectronOsShell();
  const global = globalThis as { __galeoOpenedExternal?: string[]; __galeoRevealed?: string[]; __galeoOpenedPaths?: string[] };
  return new RecordingOsShell((global.__galeoOpenedExternal ??= []), (global.__galeoRevealed ??= []), (global.__galeoOpenedPaths ??= []));
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
