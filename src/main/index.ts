import { app, BrowserWindow, clipboard, dialog, Menu, nativeTheme, webContents } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { parseArgv } from '../core/argv';
import { EditGrants } from '../core/documents/edit-grants';
import { UnsavedChanges } from '../core/documents/unsaved';
import { InputCredits } from '../core/documents/input-credits';
import { ImageGrants } from '../core/documents/images';
import { ReadIdentities } from '../core/documents/identities';
import { DocumentLinks } from '../core/documents/links';
import { DocumentMenus } from '../core/documents/menus';
import { DocumentWatches } from '../core/documents/watches';
import { SelectionGrants } from '../core/documents/selections';
import { ExternalOpenLimiter } from '../core/links/limiter';
import { AppState } from '../core/profiles/app-state';
import { DEFAULT_PROFILE, ProfileCatalog } from '../core/profiles/catalog';
import { profileIdFor } from '../core/profiles/names';
import { appImageLauncher, installLauncher } from '../core/desktop/launcher';
import { ThemeGate } from '../core/desktop/theme-gate';
import { openFiles } from '../core/routing/open-files';
import { editToggle } from '../core/documents/edit-toggle';
import { route, type Route, type RouteRequest, type RouteWorld } from '../core/routing/router';
import type { SessionFile, WindowBounds } from '../core/session/model';
import { DEFAULT_SETTINGS, settingSources } from '../core/settings/model';
import { openConfigFile } from '../core/settings/open-config';
import { CrashRecovery } from '../core/tabs/crashes';
import { TabDrags } from '../core/tabs/drags';
import { WarmTabs } from '../core/tabs/lifecycle';
import { MemoryPressure } from '../core/tabs/pressure';
import { TabRegistry, type WindowState } from '../core/tabs/registry';
import type { OpenRequest, OsShell } from '../core/ports';
import type { EventName, Events, OtherWindow, ProfileResult, ProfilesState, SettingsResult, SettingsState, StartInfo } from '../shared/contracts';
import type { Command } from '../shared/keymap';
import type { Settings, SettingsNotice } from '../shared/settings';
import { startupMode, type StartupMode } from '../core/startup';
import { CoalescingWatcher } from '../core/watch/coalescing';
import { QuickOpen } from '../core/quick-open/session';
import { DropGrants } from '../core/documents/drops';
import { asksForAttention } from '../core/routing/attention';
import { createPrivateDirs, resolveAppPaths, withTestHome } from './adapters/app-paths';
import { NodeFileSystem } from './adapters/file-system';
import { NodeFileWatcher } from './adapters/file-watcher';
import { electronSystemMetrics } from './adapters/system-metrics';
import { ElectronInstanceChannel } from './adapters/instance-channel';
import { installAppLifecycle } from './adapters/lifecycle';
import { systemClock } from './adapters/clock';
import { ElectronOsShell, RecordingOsShell } from './adapters/os-shell';
import { WorkerThreadTaskRunner } from './adapters/task-runner';
import { EmptyFontCatalog, FcListFontCatalog } from './adapters/font-catalog';
import { runFile } from './adapters/run-file';
import { decodeWithPlatform } from './adapters/text-decoder';
import { sha256 } from './adapters/content-hash';
import { utf8 } from './adapters/utf8';
import { documentHandlers } from './documents/handlers';
import { registerIpc } from './ipc/register';
import { sendEvent } from './ipc/send';
import { perfMark, reportColdStart } from './perf';
import { serveImage } from './protocol/file-images';
import { recentHandlers } from './session/recent-handlers';
import { quickOpenHandlers } from './quick-open/handlers';
import { dropHandlers } from './drops/handlers';
import { ProfileRuntime } from './profiles/runtime';
import { parseAppState } from './session/schemas';
import { parseProfileFile } from './settings/schemas';
import { registerAppProtocol, registerSchemes } from './protocol/register';
import { devServerOrigin, rendererUrl, trustedOrigins } from './renderer-entry';
import { hardenWebContents } from './security/harden';
import { installNetworkGuard, lockDownBackgroundNetworking } from './security/network-guard';
import { appResponseHeaders, hostResolverRules, networkLockdown } from './security/network-policy';
import { tabHandlers } from './tabs/handlers';
import { tabMover } from './tabs/transfer';
import { createAppWindow, followScheme, windowBounds } from './window/factory';
import { applicationMenu } from './window/menu';
import { keymapPlatform } from './window/policy';
import { showNativeMenu } from './window/native-menu';
import { ownArgs, windowTitle } from './window/policy';

const MIB = 1024 * 1024;
/** How often each window's renderer memory is sampled for pressure demotion. */
const PRESSURE_INTERVAL_MS = 30_000;
/** How long a page has to say it is asking its reader about unsaved changes before a close counts as cancelled. */
const UNSAVED_ACK_MS = 5000;
/**
 * A window's renderer above this is under pressure. Generous until the performance pass sets it
 * from the measured baseline plus headroom (ADR-002): it should catch runaway documents only.
 */
const PRESSURE_THRESHOLD_BYTES = 1536 * MIB;
/**
 * On Linux, Chromium sends a native theme update soon after the app is ready, then two together when
 * the desktop's theme settings arrive over D-Bus, about 140 ms later. A launch's first window waits
 * for the second update, at most this long from ready (ThemeGate).
 */
const THEME_UPDATES = 2;
const THEME_CAP_MS = 400;

// Node's uptime starts with the process, before any of this module runs.
perfMark('process-start', Date.now() - process.uptime() * 1000);
perfMark('main-loaded');

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
const paths = resolveAppPaths(
  withTestHome(
    { platform: process.platform, env: process.env, home: app.getPath('home'), appData: app.getPath('appData') },
    { isPackaged: app.isPackaged },
  ),
);
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
  start(startupMode(parsed.args, { sandboxed }));
}

function start(initialMode: StartupMode): void {
  let mode = initialMode;
  let choiceWindow: BrowserWindow | undefined;
  // Every change to a window's tabs goes to its page as a fresh snapshot (ADR-002).
  const pushSnapshot = (windowId: number) => {
    const contents = webContents.fromId(windowId);
    if (contents) sendEvent(contents, 'tabs.changed', documents.snapshot(windowId));
  };
  const documents = new TabRegistry(randomUUID, (windowId) => {
    pushSnapshot(windowId);
    documentWatches.sync(windowId, documents.list(windowId));
    grants.sync(windowId, documents.list(windowId));
    const profile = profileOf(windowId);
    if (profile) {
      profile.keeper.changed();
      updateTitle(profile, windowId);
    }
  });
  const fs = new NodeFileSystem();
  const grants = new EditGrants();
  const watcher = new CoalescingWatcher({ inner: new NodeFileWatcher(), clock: systemClock, fs });
  // A tab whose file changed since the page read it reads it again (live reload, UX F7).
  const documentWatches = new DocumentWatches({
    watcher,
    changed: (windowId, id) => {
      const tab = documents.get(id, windowId);
      if (tab) void reads.changed(id, tab.path).then((changed) => changed && sendTo(windowId, 'tabs.stale', id));
    },
  });
  const images = new ImageGrants(randomUUID);
  const shell = externalShell();
  const menus = new DocumentMenus({
    tabs: documents,
    fs,
    shell,
    clipboard,
    showMenu: (windowId, items) => showNativeMenu(windowId, items, app.isPackaged),
  });
  // Real input per window: what lets a request reach beyond the window's own grants (T6).
  const input = new InputCredits(Date.now);
  const links = new DocumentLinks({
    records: documents,
    input,
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
  const catalog = new ProfileCatalog({ fs, utf8, configDir: paths.configDir, stateDir: paths.stateDir, parse: parseProfileFile });
  const appState = new AppState({ fs, utf8, path: path.join(paths.stateDir, 'app-state.json'), parse: parseAppState });
  // Running profiles by id: a profile runs while it has a window (ADR-005).
  const running = new Map<string, ProfileRuntime>();
  // Saves of profiles whose last window just closed; a quit waits for them.
  // Saves of profiles whose last window just closed, by id: a quit, a restart and a delete wait for them.
  const stopping = new Map<string, Promise<void>>();
  // Window ids, the last focused first, across all profiles.
  let focusOrder: number[] = [];
  let quitting = false;
  /** What a window's page needs to paint, handed over when the window is created (and in `app.info`). */
  const startInfo = (): StartInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: keymapPlatform(process.platform),
    sandboxed,
    sandboxUnavailable: mode.kind === 'sandbox-unavailable' ? mode.cause : null,
    appImage: appImagePath() !== null,
  });
  // Open once the desktop's theme settings have arrived (set when the app is ready).
  let themeSettled: Promise<void> = Promise.resolve();
  const profileOf = (windowId: number) => [...running.values()].find((runtime) => runtime.has(windowId));
  const idsOf = (runtime: ProfileRuntime) => runtime.windows.map((window) => window.webContents.id);
  const settingsState = (profile: ProfileRuntime): SettingsState => ({
    settings: profile.settings.current,
    notices: profile.settings.notices,
    session: profile.sessionNotice,
    css: profile.settings.css,
    shared: profile.settings.shared,
    sources: profile.settings.sources,
  });
  const broadcastSettings = (profile: ProfileRuntime) => {
    for (const window of profile.windows) sendEvent(window.webContents, 'settings.changed', settingsState(profile));
  };
  const profilesState = async (current: string): Promise<ProfilesState> => ({
    current,
    profiles: (await catalog.list()).map((profile) => ({ ...profile, running: running.has(profile.id) })),
  });
  /** Every window's profile menu and chip follow profiles being created, changed, started and stopped. */
  const broadcastProfiles = async () => {
    for (const profile of running.values()) {
      const state = await profilesState(profile.id);
      for (const window of profile.windows) sendEvent(window.webContents, 'profiles.changed', state);
    }
  };
  const warmLimits = (current: Settings) => ({ count: current.warmTabs, bytes: current.warmMegabytes * MIB });
  const warm = new WarmTabs(warmLimits(DEFAULT_SETTINGS));
  const reads = new ReadIdentities(fs);
  const crashes = new CrashRecovery(Date.now);
  // The tab the reader is dragging, which another window may take once (ADR-019).
  const drags = new TabDrags();
  /** Windows closing because their last tab moved away: their profile's session keeps no empty window. */
  const emptiedByMove = new Set<number>();
  // Closing, quitting or deleting a profile with unsaved changes asks the reader first (ADR-013).
  const unsaved = new UnsavedChanges({
    dirty: (windowId) => grants.dirty(windowId),
    ask: (windowId, ids) => {
      const contents = webContents.fromId(windowId);
      if (contents) BrowserWindow.fromWebContents(contents)?.focus();
      sendTo(windowId, 'documents.confirmClose', ids);
    },
    force: (windowId) => confirmCloseUnsaved(windowId),
    clock: systemClock,
    ackMs: UNSAVED_ACK_MS,
  });
  /** Windows whose reader already agreed to close them with unsaved changes. */
  const agreedToClose = new Set<number>();
  let agreedToQuit = false;

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
  const selections = new SelectionGrants(randomUUID);
  const quickOpen = new QuickOpen({
    fs,
    clock: systemClock,
    grants: selections,
    home: app.getPath('home'),
    onUpdate: (windowId, results) => sendTo(windowId, 'quickOpen.results', results),
  });
  const drops = new DropGrants(randomUUID);
  /** A folder dropped on the window, which its next quick open searches. */
  const droppedFolders = new Map<number, string>();
  /** Shows files in the window: their tabs if it has them, else new ones after the shown one (or `after`). */
  const openInWindow = (windowId: number, files: readonly string[], after?: string | null, chosen = false) => {
    openFiles(documents, windowId, files, after, { chosen });
    // Main showed the tab itself, so the page won't report it: the warm set hears it here.
    const shown = documents.snapshot(windowId).active;
    if (files.length > 0 && shown) {
      const ids = warm.activated(windowId, shown);
      if (ids.length > 0) demote(windowId, ids);
    }
  };
  // Profiles `--profile` created, by the token their window's notice carries, until Undo or the window goes.
  const undoable = new Map<string, { profile: string; name: string; files: readonly string[]; window: number }>();

  const lockdown = networkLockdown(runtime);
  registerSchemes();
  lockDownBackgroundNetworking(lockdown.resolver ? hostResolverRules(devServerOrigin(runtime)) : null);

  /** `<file> — <profile> — galeo`, from the window's shown tab (UX). */
  const updateTitle = (profile: ProfileRuntime, windowId: number) => {
    const window = profile.windows.find((each) => each.webContents.id === windowId);
    const { tabs, active } = documents.snapshot(windowId);
    const shown = tabs.find((tab) => tab.id === active);
    const file = !shown ? null : shown.kind === 'settings' ? 'Settings' : path.basename(shown.path);
    window?.setTitle(windowTitle([file, profile.name], { sandboxed }));
  };

  /** Keys main takes before the page (ADR-004 capabilities; window keys work even when the page is busy). */
  const mainKey = (command: Command, profile: ProfileRuntime, window: BrowserWindow) => {
    // A profile being deleted gets no new windows: its folders are about to go.
    if (command === 'newWindow') {
      if (!profile.discard) openMainWindow(profile);
    }
    else if (command === 'closeWindow') window.close();
    else if (command === 'fullScreen') window.setFullScreen(!window.isFullScreen());
    else if (command === 'quit') app.quit();
    else {
      recordCapabilityKey(command);
      if (command === 'editMode') toggleEditMode(window.webContents.id);
    }
  };

  /**
   * Ctrl+E on the shown tab (ADR-013, ADR-015): grants edit mode, or asks the page to leave it. Main
   * never drops a grant itself here, as the page may hold unsaved text; it leaves once that is settled.
   * Only a file main read as text with content can be granted, and one the reader didn't hand over
   * is granted only once they confirm its path in main's own dialog.
   */
  const toggleEditMode = (windowId: number) => {
    const { active } = documents.snapshot(windowId);
    const tab = active ? documents.get(active, windowId) : undefined;
    if (!tab || tab.kind === 'settings') return;
    const toggle = editToggle({
      granted: grants.allows(tab.id, windowId, tab.path),
      text: reads.shapeOf(tab.id, tab.path) !== null,
      chosen: documents.chosen(tab.id, windowId),
    });
    if (toggle === 'leave') return sendTo(windowId, 'documents.editMode', { id: tab.id, edit: 'leave' });
    if (toggle === 'refuse') return sendTo(windowId, 'documents.editMode', { id: tab.id, edit: 'refused' });
    if (toggle === 'grant') return grantEdit(windowId, tab.id, tab.path);
    if (askingEdit.has(windowId)) return;
    askingEdit.add(windowId);
    void confirmEdit(windowId, tab.path)
      .then((edit) => {
        // Only the tab and file the key press named, if it still shows that file.
        if (!edit || documents.get(tab.id, windowId)?.path !== tab.path || grants.allows(tab.id, windowId, tab.path)) return;
        documents.markChosen(tab.id, windowId);
        grantEdit(windowId, tab.id, tab.path);
      })
      .finally(() => askingEdit.delete(windowId));
  };
  /** Windows showing main's "Edit this file?" question: one at a time. */
  const askingEdit = new Set<number>();
  const grantEdit = (windowId: number, id: string, file: string) => {
    grants.grant(id, windowId, file);
    sendTo(windowId, 'documents.editMode', { id, edit: 'granted' });
  };

  const openMainWindow = (
    profile: ProfileRuntime,
    { bounds = null, state, size }: { bounds?: WindowBounds | null; state?: WindowState; size?: { width: number; height: number } } = {},
  ) => {
    const window: BrowserWindow = createAppWindow({
      url: rendererUrl(runtime),
      sandboxed,
      onMainKey: (command) => mainKey(command, profile, window),
      bounds,
      ...(size ? { size } : {}),
      title: [null, profile.name],
      themeMode: () => profile.settings.current.themeMode,
      startInfo: startInfo(),
    });
    const windowId = window.webContents.id;
    profile.windows.push(window);
    // A new window comes to the front; after the profile's last one closed (macOS runs on), saving resumes.
    focusOrder = [windowId, ...focusOrder];
    rememberProfile(profile.id);
    warm.setLimits(warmLimits(profile.settings.current), [windowId]);
    profile.keeper.resume();
    // A restored session's tabs come back hibernated: the page renders each when shown, the active first.
    if (state) {
      documents.restoreWindow(windowId, state);
      // The restored active tab is the one the page renders first; main's warm set starts with it.
      const active = documents.snapshot(windowId).active;
      if (active) warm.activated(windowId, active);
    }
    const followBounds = () => profile.keeper.changed();
    window.on('move', followBounds);
    window.on('resize', followBounds);
    window.on('focus', () => {
      window.flashFrame(false);
      focusOrder = [windowId, ...focusOrder.filter((id) => id !== windowId)];
      rememberProfile(profile.id);
      profile.keeper.changed();
      // A shown file that came back (or changed) is read again (UX: missing recovers). Hibernated
      // tabs read when they wake anyway.
      for (const id of warm.warm(windowId)) {
        const tab = documents.get(id, windowId);
        if (tab) void reads.changed(id, tab.path).then((changed) => changed && sendTo(windowId, 'tabs.stale', id));
      }
    });
    window.on('close', (event) => {
      if (!quitting && !profile.discard && !agreedToClose.has(windowId) && grants.dirty(windowId).length > 0) {
        event.preventDefault();
        void unsaved.confirm([windowId]).then((proceed) => {
          if (!proceed || window.isDestroyed()) return;
          agreedToClose.add(windowId);
          window.close();
        });
        return;
      }
      if (quitting || profile.discard) return;
      // The profile's last window: what it holds now is what the save keeps, not the empty aftermath.
      if (profile.windows.length === 1) return void profile.keeper.holdForQuit(emptiedByMove.has(windowId) ? { without: windowId } : {});
      // One of several: its tabs stay recoverable with Ctrl+Shift+T while the profile runs (UX F5).
      const closed = documents.exportWindow(windowId);
      if (closed.tabs.length > 0) profile.keepClosed({ state: closed, bounds: windowBounds(window), at: documents.stamp() });
    });
    window.webContents.on('input-event', (_event, event) => {
      if (REAL_INPUT.has(event.type)) input.received(windowId);
      if (event.type === 'mouseDown') input.pressed(windowId);
      else if (event.type === 'mouseUp') input.released(windowId);
    });
    window.webContents.on('render-process-gone', (_event, details) => {
      if (details.reason === 'clean-exit' || quitting || window.isDestroyed()) return;
      recoverFromCrash(window, details.reason);
    });
    window.on('closed', () => {
      profile.windows.splice(profile.windows.indexOf(window), 1);
      focusOrder = focusOrder.filter((id) => id !== windowId);
      for (const tab of documents.list(windowId)) {
        links.forget(tab.id);
        reads.forget(tab.id);
      }
      documents.closeWindow(windowId);
      warm.closeWindow(windowId);
      crashes.closeWindow(windowId);
      input.closeWindow(windowId);
      grants.closeWindow(windowId);
      unsaved.closeWindow(windowId);
      agreedToClose.delete(windowId);
      emptiedByMove.delete(windowId);
      if (drags.end(windowId)) broadcastDragging(false);
      images.closeWindow(windowId);
      quickOpen.close(windowId);
      drops.closeWindow(windowId);
      droppedFolders.delete(windowId);
      selections.closeWindow(windowId);
      for (const [token, created] of undoable) if (created.window === windowId) undoable.delete(token);
      // A quit saves every running profile itself, before its windows close.
      if (quitting) return;
      if (profile.windows.length > 0) profile.keeper.changed();
      else stopProfile(profile);
    });
    perfMark('window-created');
    // Asked once the page has loaded: a launch's files are in the window by then.
    reportColdStart(window, { document: () => documents.list(windowId).length > 0 });
    return window;
  };

  /**
   * A window's renderer went away (ADR-002): the tab it was rendering is marked crashed, so it isn't
   * rendered again until the reader asks, and the page comes back with its tabs from the registry,
   * only the shown one rendered. A window that keeps crashing comes back showing the crash-loop
   * message instead (UX §4), and is left down if even that crashes.
   */
  const recoverFromCrash = (window: BrowserWindow, reason: string) => {
    const windowId = window.webContents.id;
    const { tab, then } = crashes.crashed(windowId);
    crashingForTests.delete(windowId);
    console.warn(`galeo: window ${windowId} renderer gone (${reason})${tab ? ', crashed while rendering a tab' : ''}`);
    if (tab) documents.markCrashed(tab, windowId);
    if (then === 'stay-down') return console.warn(`galeo: window ${windowId} crashed again on the crash-loop message; left down`);
    if (then === 'give-up') console.warn(`galeo: window ${windowId} crashed repeatedly; showing the crash-loop message`);
    reloadWithTabs(window, { activate: then === 'reload' });
  };

  /** The window's page loads again, its tabs hibernated but for the shown one (unless it shows the crash loop). */
  const reloadWithTabs = (window: BrowserWindow, { activate }: { activate: boolean }) => {
    const windowId = window.webContents.id;
    for (const id of warm.warm(windowId)) warm.forget(windowId, id);
    for (const record of documents.list(windowId)) reads.forget(record.id);
    // The page comes back read-only; tabs with unsaved text get it back from main, still editable.
    grants.dropClean(windowId);
    const active = documents.snapshot(windowId).active;
    if (active && activate) warm.activated(windowId, active);
    window.webContents.reload();
  };

  /**
   * Unpackaged test runs kill a window's renderer as it starts rendering the file
   * `globalThis.__galeoCrashOnRendering` names. The page goes on until the crash lands, so its later
   * reports are ignored, as a crash in the middle of rendering would never have sent them.
   */
  const crashingForTests = new Set<number>();
  const crashesForTests: Pick<CrashRecovery, 'rendering' | 'rendered'> = {
    rendering: (windowId, id) => {
      crashes.rendering(windowId, id);
      ((globalThis as { __galeoRenderingSeen?: string[] }).__galeoRenderingSeen ??= []).push(documents.get(id, windowId)?.path ?? id);
      const wanted = (globalThis as { __galeoCrashOnRendering?: string }).__galeoCrashOnRendering;
      if (!wanted || documents.get(id, windowId)?.path !== wanted) return;
      crashingForTests.add(windowId);
      // Killed by the OS, after this handler: forcefullyCrashRenderer can leave a renderer hung
      // instead of gone (seen on a Linux CI runner), and then main never hears it went.
      const contents = webContents.fromId(windowId);
      if (contents) setImmediate(() => process.kill(contents.getOSProcessId(), 'SIGKILL'));
    },
    rendered: (windowId, id) => {
      if (!crashingForTests.has(windowId)) crashes.rendered(windowId, id);
    },
  };

  /** The profile last worked in, where launches go when no window is open (ADR-005). */
  const rememberProfile = (id: string) => void appState.setLastProfile(id).catch((error: unknown) => console.warn('galeo: app state not saved', error));

  const startRuntime = async (id: string): Promise<ProfileRuntime> => {
    // A profile starting again reads its session only once its last save has landed.
    await stopping.get(id);
    const name = (await catalog.list()).find((each) => each.id === id)?.name ?? id;
    const profile = new ProfileRuntime(id, name, { fs, utf8, watcher, clock: systemClock, paths, tabs: documents, focusOrder: () => focusOrder });
    running.set(id, profile);
    profile.settings.onChange((current) => {
      for (const window of profile.windows) followScheme(window);
      for (const [windowId, ids] of warm.setLimits(warmLimits(current), idsOf(profile))) demote(windowId, ids);
      broadcastSettings(profile);
    });
    profile.settings.onNotices((notices) => {
      reportSettingsNotices(notices);
      broadcastSettings(profile);
    });
    profile.settings.onCss(() => broadcastSettings(profile));
    // A hand edit of profile.json's name or accent shows at once, like a rename in the menu.
    profile.settings.onIdentity((identity) => {
      profile.name = identity.name ?? profile.id;
      for (const windowId of idsOf(profile)) updateTitle(profile, windowId);
      void broadcastProfiles();
    });
    try {
      await profile.settings.start();
    } catch (error) {
      running.delete(id);
      profile.settings.stop();
      throw error;
    }
    reportSettingsNotices(profile.settings.notices);
    perfMark('profile-started');
    // Loading stats every recent file (a hung network mount would hang); nothing waits for it.
    void profile.recent.load().catch((error: unknown) => console.warn('galeo: recent files not loaded', error));
    return profile;
  };

  /** Starts a profile with its session's windows, the last focused opened last so it ends up in front. */
  const startProfile = async (id: string): Promise<BrowserWindow | null> => {
    const profile = await startRuntime(id);
    const { session, notice } = await profile.sessions.load();
    perfMark('session-loaded');
    await themeSettled;
    if (notice) reportSessionNotice(notice);
    profile.sessionNotice = notice;
    let front: BrowserWindow | null = null;
    if (session && session.windows.length > 0) {
      const order = [...session.windows.keys()].sort((a, b) => rank(session, b) - rank(session, a));
      const opened = new Map(order.map((index) => [index, openMainWindow(profile, { bounds: session.windows[index]!.bounds, state: session.windows[index]! })]));
      front = opened.get(session.focusOrder[0] ?? order.at(-1)!)!;
    }
    profile.keeper.start();
    void broadcastProfiles();
    return front;
  };

  const windowOf = (windowId: number) => {
    const contents = webContents.fromId(windowId);
    return contents ? BrowserWindow.fromWebContents(contents) : null;
  };
  /** Every window hears a tab drag start and end: the whole tab bar takes drops meanwhile (ADR-019). */
  const broadcastDragging = (on: boolean) => {
    for (const profile of running.values()) for (const window of profile.windows) sendEvent(window.webContents, 'tabs.dragging', on);
  };
  const moveTab = tabMover({
    tabs: documents,
    grants,
    warm,
    crashes,
    demote,
    emptied: (windowId) => {
      emptiedByMove.add(windowId);
      windowOf(windowId)?.close();
    },
  });
  /** The tab gets a window of its own, of its profile, at the size of the one it left; the platform places it. */
  const tearOff = (id: string, from: number) => {
    const profile = profileOf(from);
    const source = windowOf(from);
    if (!profile || !source || profile.discard) return false;
    const { width, height } = source.getNormalBounds();
    const window = openMainWindow(profile, { size: { width, height } });
    return moveTab(id, from, window.webContents.id, 0);
  };
  /** The galeo windows other than this one, last focused first, by profile and shown file. */
  const otherWindows = async (windowId: number): Promise<OtherWindow[]> => {
    const accents = new Map((await catalog.list()).map((profile) => [profile.id, profile.accent]));
    return focusOrder
      .filter((id) => id !== windowId)
      .flatMap((id) => {
        const profile = profileOf(id);
        if (!profile) return [];
        const { tabs, active } = documents.snapshot(id);
        const shown = tabs.find((tab) => tab.id === active);
        const shows = !shown ? null : shown.kind === 'settings' ? 'Settings' : path.basename(shown.path);
        return [{ window: id, profile: profile.name, accent: accents.get(profile.id) ?? null, shows }];
      });
  };

  const stopProfile = (profile: ProfileRuntime) => {
    running.delete(profile.id);
    const stop = profile
      .stop()
      .catch((error: unknown) => console.warn(`galeo: profile ${profile.id} not saved`, error))
      .finally(() => stopping.get(profile.id) === stop && stopping.delete(profile.id));
    void broadcastProfiles();
    stopping.set(profile.id, stop);
  };

  /** The profile of the window a request came from; a window always belongs to one. */
  const ownProfile = (event: { sender: { id: number } }) => {
    const profile = profileOf(event.sender.id);
    if (!profile) throw new Error('no profile');
    return profile;
  };

  /** What routing sees; `without` leaves a profile out (an undone creation). */
  const world = async (without?: string): Promise<RouteWorld> => ({
    profiles: (await catalog.list()).filter((profile) => profile.id !== without),
    windows: [...running.values()]
      .filter((profile) => profile.id !== without)
      .flatMap((profile) => idsOf(profile).map((id) => ({ id, profile: profile.id }))),
    focusOrder,
    lastProfile: appState.lastProfile === without ? null : appState.lastProfile,
  });

  /**
   * Opens files where ADR-005 says. An existing window gets the tabs without being raised (no
   * focus stealing); a request without files asks for the window itself, so that one is focused.
   */
  const openRouted = async (request: RouteRequest, files: readonly string[], { without, chosen = false }: { without?: string; chosen?: boolean } = {}): Promise<Route> => {
    const decision = route(request, await world(without));
    if (decision.kind === 'invalid') return decision;
    if (decision.create !== null) {
      // Routing and the catalog check names alike, so this only fails if they ever drift apart.
      const created = await catalog.create(decision.profile, decision.create, null);
      if (!created.ok) throw new Error(`profile ${decision.create} not created: ${created.reason}`);
    }
    let window = decision.start ? await startProfile(decision.profile) : null;
    let fresh = decision.start;
    const profile = running.get(decision.profile)!;
    if (typeof decision.window === 'number') window = profile.windows.find((each) => each.webContents.id === decision.window)!;
    else if (decision.window === 'new' || !window) {
      await themeSettled;
      window = openMainWindow(profile);
      fresh = true;
    }
    const windowId = window.webContents.id;
    openInWindow(windowId, files, undefined, chosen);
    // Files added behind the reader's back, maybe on another workspace: the window asks for
    // attention, and is never raised for it (ADR-005).
    if (asksForAttention({ fresh, files: files.length, focused: window.isFocused() })) requestAttention(window);
    if (!fresh && files.length === 0) window.focus();
    if (decision.create !== null) {
      undoable.set(randomUUID(), { profile: decision.profile, name: decision.create, files, window: windowId });
    }
    return decision;
  };

  const openRequest = async (request: OpenRequest) => {
    const parsedRequest = parseArgv(request.argv, { cwd: request.cwd, forwarded: request.source !== 'launch', resolve: path.resolve });
    if (!parsedRequest.ok) return void console.warn(`galeo: open request ignored: ${parsedRequest.error}`);
    const { profile, newWindow, files } = parsedRequest.args;
    // The command line, Files or a second launch: files the reader handed over (ADR-015).
    const routed = await openRouted({ profile, newWindow }, files, { chosen: true });
    if (routed.kind === 'invalid') console.warn(`galeo: open request ignored: --profile name ${routed.reason}`);
  };

  // Requests are handled one at a time: each sees the windows and profiles the one before left.
  let routing: Promise<unknown> = Promise.resolve();
  /** Runs `task` after the ones before it; its own promise carries its result or error (already logged). */
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = routing.then(task);
    routing = run.catch((error: unknown) => console.warn('galeo: open request failed', error));
    return run;
  };
  const acceptOpenRequests = () => instance.onOpenRequest((request) => void enqueue(() => openRequest(request)).catch(() => {}));

  /** Undo of a created profile: its files go where they would have gone, then it is deleted unsaved. */
  const undoCreate = async (token: string) => {
    const created = undoable.get(token);
    if (!created) return;
    undoable.delete(token);
    await removeProfile(created.profile, created.files);
  };

  /**
   * Deletes a profile, unsaved (UX F5: its session and settings; files are never touched). Its
   * `files` go where they would have gone without it, first: closing the app's last window would quit it.
   */
  const removeProfile = async (id: string, files: readonly string[]) => {
    // Files a launch handed over, going where they would have gone without the profile.
    await openRouted({ profile: null, newWindow: false }, files, { without: id, chosen: true });
    const profile = running.get(id);
    if (profile) {
      profile.discard = true;
      const closing = [...profile.windows].map(
        (window) =>
          new Promise<void>((resolve) => {
            window.once('closed', () => resolve());
            window.close();
          }),
      );
      await Promise.all(closing);
      await stopping.get(id);
    }
    await catalog.delete(id);
    await broadcastProfiles();
  };

  const createProfile = async (name: string, accent: string | null): Promise<ProfileResult> => {
    const ids = (await catalog.list()).map((profile) => profile.id);
    const created = await catalog.create(profileIdFor(name, ids), name, accent);
    if (!created.ok) return created;
    await openRouted({ profile: created.profile.id, newWindow: false }, []);
    return { ok: true };
  };

  const updateProfile = async (profile: ProfileRuntime, name: string, accent: string | null): Promise<ProfileResult> => {
    const updated = await catalog.update(profile.id, accent === null ? { name } : { name, accent });
    if (!updated.ok) return { ok: false, reason: updated.reason };
    profile.name = updated.profile.name;
    for (const windowId of idsOf(profile)) updateTitle(profile, windowId);
    await broadcastProfiles();
    return { ok: true };
  };

  // Saving is async; the quit waits for it once.
  let savedOnQuit = false;
  app.on('before-quit', (event) => {
    if (savedOnQuit) return;
    event.preventDefault();
    if (!agreedToQuit) {
      // Unsaved changes anywhere: their readers decide first; a Cancel keeps the app running.
      const windows = [...running.values()].flatMap((profile) => profile.windows.map((window) => window.webContents.id));
      void unsaved.confirm(windows).then((proceed) => {
        if (!proceed) return;
        agreedToQuit = true;
        app.quit();
      });
      return;
    }
    quitting = true;
    // `stop` saves each running profile, and leaves one being deleted unsaved.
    const saves = [...running.values()].map((profile) => profile.stop());
    void Promise.allSettled([...saves, ...stopping.values()]).finally(() => {
      savedOnQuit = true;
      app.quit();
    });
  });

  void app.whenReady().then(async () => {
    perfMark('app-ready');
    const themeGate = new ThemeGate({ clock: systemClock, updates: process.platform === 'linux' ? THEME_UPDATES : 0, capMs: THEME_CAP_MS });
    const onThemeUpdated = () => themeGate.updated();
    nativeTheme.on('updated', onThemeUpdated);
    themeSettled = themeGate.opened().then(() => void nativeTheme.off('updated', onThemeUpdated));
    const menu = applicationMenu(process.platform);
    Menu.setApplicationMenu(menu && Menu.buildFromTemplate(menu));
    await appState.load();
    perfMark('state-loaded');
    pressure.start();
    hardenWebContents();
    if (lockdown.guard) {
      installNetworkGuard(
        { devServerOrigin: devServerOrigin(runtime), allowDevTools: !app.isPackaged },
        recordBlockedRequest,
      );
    }
    registerAppProtocol(path.join(import.meta.dirname, '../renderer'), appResponseHeaders(), (url) =>
      serveImage(url, { lookup: (id) => images.lookup(id), fs }),
    );
    let restoring = false;
    const fonts = process.platform === 'linux' ? new FcListFontCatalog() : new EmptyFontCatalog();
    registerIpc(
      {
        'app.info': (_args, event) => ({ ...startInfo(), crashLoop: crashes.gaveUp(event.sender.id) }),
        // Changes beyond the page (a launcher, a profile) only on the reader's input (T6).
        'app.installLauncher': async (_args, event) => {
          if (!input.spend(event.sender.id)) throw new Error('no input');
          const appImage = appImagePath();
          if (!appImage) throw new Error('not an AppImage');
          const home = app.getPath('home');
          const script = utf8.decode(await fs.readFile(path.join(path.dirname(process.execPath), 'gal'), { maxBytes: 64 * 1024 }));
          const files = appImageLauncher(
            appImage,
            {
              binDir: path.join(home, '.local', 'bin'),
              applicationsDir: path.join(xdgDataHome(home), 'applications'),
              iconsDir: path.join(xdgDataHome(home), 'icons'),
              mimeDir: path.join(xdgDataHome(home), 'mime'),
            },
            script,
          );
          if (!files.ok) return files;
          const icon = await fs.readFile(path.join(process.resourcesPath, 'icon.png'), { maxBytes: 1024 * 1024 }).catch(() => null);
          const mime = await fs.readFile(path.join(process.resourcesPath, 'mime.xml'), { maxBytes: 64 * 1024 }).catch(() => null);
          const packageEntries = xdgDataDirs().map((dir) => path.join(dir, 'applications', 'galeo.desktop'));
          // Fixed program and arguments; the folder is the user's own MIME database.
          const refreshMime = (database: string) => runFile('update-mime-database', [database], { timeout: 30_000, maxBuffer: 1024 * 1024 }).then(() => undefined);
          const installed = await installLauncher({ fs, utf8, refreshMime }, files, { icon, mime }, packageEntries);
          return installed.ok ? { ok: true, bin: files.bin.path } : installed;
        },
        'app.resolveSandboxUnavailable': ([choice]) => {
          if (mode.kind !== 'sandbox-unavailable') throw new Error('sandbox choice not offered');
          if (choice === 'quit') {
            app.quit();
            return;
          }
          mode = { kind: 'normal' };
          acceptOpenRequests();
          // Closed once the launch's window is open: the app quits when its last window closes.
          void enqueue(async () => choiceWindow?.close()).catch(() => {});
        },
        'settings.get': (_args, event) => {
          const profile = profileOf(event.sender.id);
          return profile ? settingsState(profile) : { settings: DEFAULT_SETTINGS, notices: [], session: null, css: { global: '', profile: '' }, shared: DEFAULT_SETTINGS, sources: settingSources({}, {}) };
        },
        'profiles.list': (_args, event) => profilesState(profileOf(event.sender.id)?.id ?? DEFAULT_PROFILE),
        'profiles.open': async ([id]) => {
          if (!(await catalog.list()).some((profile) => profile.id === id)) throw new Error('no such profile');
          await enqueue(() => openRouted({ profile: id, newWindow: false }, []));
        },
        'profiles.create': ([name, accent]) => enqueue(() => createProfile(name, accent)),
        'profiles.update': ([name, accent], event) => {
          const profile = ownProfile(event);
          return enqueue(() => updateProfile(profile, name, accent));
        },
        'profiles.delete': async (_args, event) => {
          if (!input.spend(event.sender.id)) throw new Error('no input');
          const profile = profileOf(event.sender.id);
          if (!profile || profile.id === DEFAULT_PROFILE) throw new Error('not deletable');
          if (!(await unsaved.confirm(profile.windows.map((window) => window.webContents.id)))) return;
          return enqueue(() => removeProfile(profile.id, []));
        },
        'session.previous': (_args, event) => profileOf(event.sender.id)?.sessions.previous() ?? [],
        'session.restorePrevious': async ([snapshot], event) => {
          const profile = profileOf(event.sender.id);
          if (mode.kind !== 'normal' || restoring || !profile) throw new Error('not now');
          restoring = true;
          try {
            const previous = await profile.sessions.readPrevious(snapshot);
            if (!previous) throw new Error('no such session');
            // The asking window, empty, takes the first window's tabs; the others open new windows.
            const [first, ...rest] = previous.windows;
            if (first && documents.list(event.sender.id).length === 0) documents.restoreWindow(event.sender.id, first);
            else if (first) rest.unshift(first);
            for (const window of rest) openMainWindow(profile, { bounds: window.bounds, state: window });
          } finally {
            restoring = false;
          }
        },
        'profiles.created': (_args, event) => {
          for (const [token, created] of undoable) if (created.window === event.sender.id) return { name: created.name, token };
          return null;
        },
        'profiles.undoCreate': ([token], event) => {
          if (undoable.get(token)?.window !== event.sender.id) throw new Error('not offered');
          return enqueue(() => undoCreate(token));
        },
        'settings.set': async ([scope, change], event) => written(await ownProfile(event).settings.set(scope, change)),
        'settings.reset': async ([key], event) => written(await ownProfile(event).settings.reset(key)),
        // fc-list with fixed arguments, nothing from the page; any window may ask (zero network).
        'settings.fonts': () => fonts.list(),
        'settings.openCustomCss': ([scope], event) => {
          const profile = ownProfile(event);
          const dir = scope === 'global' ? paths.configDir : path.join(paths.configDir, 'profiles', profile.id);
          return openConfigFile({ fs, shell, utf8 }, path.join(dir, 'custom.css'), customCssTemplate(scope));
        },
        'settings.openNoticeFile': ([index], event) => {
          const notice = ownProfile(event).settings.notices[index];
          if (!notice) throw new Error('no such notice');
          return openConfigFile({ fs, shell, utf8 }, notice.path);
        },
        'tabs.openSettings': (_args, event) => documents.openSettings(event.sender.id).id,
        'window.command': ([command], event) => {
          const profile = profileOf(event.sender.id);
          const window = profile?.windows.find((each) => each.webContents.id === event.sender.id);
          if (profile && window) mainKey(command, profile, window);
        },
        'window.retryAfterCrashes': (_args, event) => {
          const window = profileOf(event.sender.id)?.windows.find((each) => each.webContents.id === event.sender.id);
          if (!window || !crashes.retry(event.sender.id)) throw new Error('not showing the crash loop');
          reloadWithTabs(window, { activate: true });
        },
        'documents.pathMenu': ([id], event) => {
          if (documents.get(id, event.sender.id)?.kind === 'settings') throw new Error('not a document');
          return menus.path(id, event.sender.id);
        },
        'documents.contextMenu': ([id], event) => {
          if (documents.get(id, event.sender.id)?.kind === 'settings') throw new Error('not a document');
          return menus.document(id, event.sender.id);
        },
        ...documentHandlers({
          records: documents,
          links,
          reads,
          fs,
          decode: decodeWithPlatform,
          hash: sha256,
          grants,
          input,
          unsaved,
          opened: (file, windowId) =>
            void profileOf(windowId)?.recent.add(file).catch((error: unknown) => console.warn('galeo: recent files not saved', error)),
        }),
        ...tabHandlers({
          tabs: documents,
          warm,
          reads,
          crashes: app.isPackaged ? crashes : crashesForTests,
          resync: pushSnapshot,
          closed: (id) => links.forget(id),
          demote,
          stale: (windowId, id) => sendTo(windowId, 'tabs.stale', id),
          positioned: (windowId) => profileOf(windowId)?.keeper.changed(),
          closedWindows: {
            at: (windowId) => profileOf(windowId)?.closedWindows.at(-1)?.at ?? null,
            reopen: (windowId) => {
              const profile = profileOf(windowId);
              const closed = profile?.closedWindows.pop();
              if (profile && closed) openMainWindow(profile, { bounds: closed.bounds, state: closed.state });
            },
          },
          drags,
          now: Date.now,
          input,
          move: moveTab,
          tearOff,
          windows: otherWindows,
          focus: (windowId) => windowOf(windowId)?.focus(),
          dragging: broadcastDragging,
          tellDragging: (window) => {
            const contents = webContents.fromId(window);
            if (contents) sendEvent(contents, 'tabs.dragging', true);
          },
          after: (ms, run) => void setTimeout(run, ms),
        }),
        ...recentHandlers({ recent: (windowId) => profileOf(windowId)?.recent, input, selections, open: (windowId, file) => openInWindow(windowId, [file]) }),
        ...dropHandlers({
          drops,
          fs,
          received: (windowId, drop) => sendTo(windowId, 'drops.received', drop),
          open: (windowId, files, after) => openInWindow(windowId, files, after),
          searchFolder: (windowId, folder) => droppedFolders.set(windowId, folder),
        }),
        ...quickOpenHandlers({
          quickOpen,
          input,
          request: (windowId) => {
            const profile = profileOf(windowId);
            if (!profile) return null;
            const tabs = documents.list(windowId).filter((tab) => tab.kind !== 'settings');
            const active = tabs.find((tab) => tab.id === documents.snapshot(windowId).active) ?? null;
            const folder = droppedFolders.get(windowId);
            droppedFolders.delete(windowId);
            return {
              ...(folder === undefined ? {} : { folder }),
              active: active?.path ?? null,
              tabs: tabs.map((tab) => tab.path),
              recent: profile.recent.list().map((file) => file.path),
              exclude: profile.settings.current.quickOpenExclude,
            };
          },
          open: async (windowId, file, newWindow) => {
            const profile = profileOf(windowId);
            if (!profile) return;
            if (newWindow) await enqueue(() => openRouted({ profile: profile.id, newWindow: true }, [file]));
            else openInWindow(windowId, [file]);
          },
        }),
      },
      trustedOrigins(runtime),
    );
    if (mode.kind === 'sandbox-unavailable') {
      choiceWindow = createAppWindow({ url: rendererUrl(runtime), sandboxed, dialog: true, startInfo: startInfo() });
    } else {
      acceptOpenRequests();
    }
    installAppLifecycle(app, {
      platform: process.platform,
      windowCount: () => BrowserWindow.getAllWindows().length,
      // macOS without windows: the dock icon brings back the last profile, as a launch would.
      openWindow: () => {
        if (mode.kind === 'normal') void enqueue(() => openRouted({ profile: null, newWindow: false }, [])).catch(() => {});
      },
    });
  });
}

/**
 * The reader pressing a key, clicking or tapping: one event each, so each earns one input credit (a
 * key press also sends `char`, not counted; Chromium sends `rawKeyDown` or `keyDown` per press).
 */
const REAL_INPUT = new Set<Electron.InputEvent['type']>(['rawKeyDown', 'keyDown', 'mouseDown', 'gestureTap', 'touchStart']);

/**
 * Flashes the window's taskbar entry (GNOME: "galeo is ready") until it's focused. Unpackaged
 * test runs count the requests in `globalThis.__galeoAttention`, since a headless desktop shows none.
 */
function requestAttention(window: BrowserWindow): void {
  window.flashFrame(true);
  if (!app.isPackaged) {
    const requests = ((globalThis as { __galeoAttention?: number[] }).__galeoAttention ??= []);
    requests.push(window.webContents.id);
  }
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

/** Capability keys main took before the page saw them. Unpackaged test runs read `globalThis.__galeoCapabilityKeys`. */
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
 * Asks, in a native dialog the page can't draw or answer, whether to edit a file the reader didn't
 * hand over (ADR-015). Cancel is the default. Unpackaged test runs answer with `GALEO_TEST_EDIT_ANSWER`
 * and record each path asked about in `globalThis.__galeoEditAsked`.
 */
async function confirmEdit(windowId: number, file: string): Promise<boolean> {
  const answer = !app.isPackaged ? process.env['GALEO_TEST_EDIT_ANSWER'] : undefined;
  if (answer) {
    ((globalThis as { __galeoEditAsked?: string[] }).__galeoEditAsked ??= []).push(file);
    return answer === 'edit';
  }
  const contents = webContents.fromId(windowId);
  const owner = contents && BrowserWindow.fromWebContents(contents);
  const options = {
    type: 'question' as const,
    message: `Edit "${path.basename(file)}"?`,
    detail: `${file}\n\nThis file was opened from a link, a drop, quick open or recent files. galeo asks once before editing a file you didn't open from the desktop or the command line.`,
    buttons: ['Edit', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
  };
  const { response } = owner ? await dialog.showMessageBox(owner, options) : await dialog.showMessageBox(options);
  return response === 0;
}

/**
 * Main's own question when a window is closed again while its page is still asking about unsaved
 * changes: a page can't keep its window, or the app, open for ever. Keep waiting is the default.
 * Unpackaged test runs answer with `GALEO_TEST_CLOSE_UNSAVED_ANSWER` (`close` or `wait`).
 */
async function confirmCloseUnsaved(windowId: number): Promise<boolean> {
  const answer = !app.isPackaged ? process.env['GALEO_TEST_CLOSE_UNSAVED_ANSWER'] : undefined;
  if (answer) return answer === 'close';
  const contents = webContents.fromId(windowId);
  const owner = contents && BrowserWindow.fromWebContents(contents);
  const options = {
    type: 'warning' as const,
    message: 'This window is still asking about unsaved changes.',
    detail: 'Close it without saving? Its unsaved changes will be lost.',
    buttons: ['Keep waiting', 'Close without saving'],
    defaultId: 0,
    cancelId: 0,
  };
  const { response } = owner ? await dialog.showMessageBox(owner, options) : await dialog.showMessageBox(options);
  return response === 1;
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

function written(notice: SettingsNotice | null): SettingsResult {
  return notice ? { ok: false, path: notice.path } : { ok: true };
}

/** The first text of a new `custom.css`, so the file says what it is for. */
function customCssTemplate(scope: 'global' | 'profile'): string {
  return [
    `/* galeo: CSS for documents in ${scope === 'global' ? 'every profile' : 'this profile'}.`,
    '   It applies inside documents only, after the bundled theme; saving applies it at once.',
    '   The --galeo-* variables (fonts, sizes, colours) are the stable way to restyle. */',
    '',
  ].join('\n');
}

/** The AppImage this packaged run came from (its runtime sets APPIMAGE), or null. */
function appImagePath(): string | null {
  const appImage = app.isPackaged ? process.env['APPIMAGE'] : undefined;
  return appImage && path.isAbsolute(appImage) ? appImage : null;
}

/** `$XDG_DATA_DIRS`, keeping only absolute entries, else the XDG spec's default. */
function xdgDataDirs(): string[] {
  const dirs = (process.env['XDG_DATA_DIRS'] ?? '').split(':').filter((dir) => path.isAbsolute(dir));
  return dirs.length ? dirs : ['/usr/local/share', '/usr/share'];
}

/** `$XDG_DATA_HOME`, which the XDG spec says to ignore unless absolute, else `~/.local/share`. */
function xdgDataHome(home: string): string {
  const configured = process.env['XDG_DATA_HOME'];
  return configured && path.isAbsolute(configured) ? configured : path.join(home, '.local', 'share');
}
