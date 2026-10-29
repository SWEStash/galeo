import { app, BrowserWindow, clipboard, dialog, Menu, nativeTheme, webContents, type MessageBoxOptions } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { parseArgv } from '../core/argv';
import { EditGrants } from '../core/documents/edit-grants';
import { TabSearches } from '../core/documents/find-all';
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
import { ProfileCatalog } from '../core/profiles/catalog';
import { profileIdFor } from '../core/profiles/names';
import { ThemeGate } from '../core/desktop/theme-gate';
import { openFiles, spelledAsOpen } from '../core/routing/open-files';
import { editToggle } from '../core/documents/edit-toggle';
import { route, type Route, type RouteRequest, type RouteWorld } from '../core/routing/router';
import type { SessionFile, WindowBounds } from '../core/session/model';
import { CrashRecovery } from '../core/tabs/crashes';
import { TabDrags } from '../core/tabs/drags';
import { WarmTabs } from '../core/tabs/lifecycle';
import { forPage } from '../core/tabs/page';
import { MemoryPressure } from '../core/tabs/pressure';
import { TabRegistry, type WindowState } from '../core/tabs/registry';
import type { OpenRequest, OsShell } from '../core/ports';
import type { EventName, Events, OtherWindow, ProfileResult, ProfilesState, StartInfo } from '../shared/contracts';
import type { Command } from '../shared/keymap';
import { DEFAULT_SETTINGS, type Settings, type SettingsNotice } from '../shared/settings';
import { startupMode, type StartupMode } from '../core/startup';
import { CoalescingWatcher } from '../core/watch/coalescing';
import { QuickOpen } from '../core/quick-open/session';
import { DropGrants } from '../core/documents/drops';
import { asksForAttention, attentionRequest } from '../core/routing/attention';
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
import { appHandlers, appImagePath } from './app/handlers';
import { documentHandlers } from './documents/handlers';
import { registerIpc } from './ipc/register';
import { sendEvent } from './ipc/send';
import { perfMark, reportColdStart } from './perf';
import { serveImage } from './protocol/file-images';
import { recentHandlers } from './session/recent-handlers';
import { quickOpenHandlers } from './quick-open/handlers';
import { dropHandlers } from './drops/handlers';
import { profileHandlers } from './profiles/handlers';
import { RunningProfiles } from './profiles/lifecycle';
import { ProfileRuntime } from './profiles/runtime';
import { parseAppState } from './session/schemas';
import { sessionHandlers } from './session/session-handlers';
import { settingsHandlers, settingsState } from './settings/handlers';
import { parseProfileFile } from './settings/schemas';
import { registerAppProtocol, registerSchemes } from './protocol/register';
import { devServerOrigin, rendererUrl, trustedOrigins } from './renderer-entry';
import { hardenWebContents } from './security/harden';
import { installNetworkGuard, lockDownBackgroundNetworking } from './security/network-guard';
import { appResponseHeaders, hostResolverRules, networkLockdown } from './security/network-policy';
import { tabHandlers } from './tabs/handlers';
import { tabMover } from './tabs/transfer';
import { testHooks } from './test-hooks';
import { WindowCleanups } from './window/cleanups';
import { windowCrashes } from './window/crash';
import { FocusOrder } from './window/focus-order';
import { countInput, followBounds, guardClose, recoverOnCrash, trackFocus } from './window/hooks';
import { createAppWindow, followScheme, windowBounds } from './window/factory';
import { windowHandlers } from './window/handlers';
import { applicationMenu } from './window/menu';
import { showNativeMenu } from './window/native-menu';
import { keymapPlatform, ownArgs, windowTitle } from './window/policy';

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
  // What a closed window's state is let go from, registered where each is created (ADR-026).
  const cleanups = new WindowCleanups();
  // Every change to a window's tabs goes to its page as a fresh snapshot (ADR-002).
  const pushSnapshot = (windowId: number) => {
    const contents = webContents.fromId(windowId);
    if (contents) sendEvent(contents, 'tabs.changed', forPage(documents.snapshot(windowId), app.getPath('home')));
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
  cleanups.add((windowId) => grants.closeWindow(windowId));
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
  cleanups.add((windowId) => images.closeWindow(windowId));
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
  cleanups.add((windowId) => input.closeWindow(windowId));
  // One worker for main's parsing and searches; it starts on the first task, not at launch.
  const tasks = new WorkerThreadTaskRunner(path.join(import.meta.dirname, 'task-worker.js'));
  const searches = new TabSearches({ records: documents, grants, fs, decode: decodeWithPlatform, tasks });
  cleanups.add((windowId) => searches.closeWindow(windowId));
  const links = new DocumentLinks({
    records: documents,
    input,
    fs,
    images,
    tasks,
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
  const running = new RunningProfiles<ProfileRuntime>({ create: (id) => createRuntime(id), changed: () => void broadcastProfiles() });
  const focusOrder = new FocusOrder();
  cleanups.add((windowId) => focusOrder.remove(windowId));
  let quitting = false;
  const appImage = appImagePath(app.isPackaged, process.env);
  /** What a window's page needs to paint, handed over when the window is created (and in `app.info`). */
  const startInfo = (): StartInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: keymapPlatform(process.platform),
    sandboxed,
    sandboxUnavailable: mode.kind === 'sandbox-unavailable' ? mode.cause : null,
    appImage: appImage !== null,
  });
  // Open once the desktop's theme settings have arrived (set when the app is ready).
  let themeSettled: Promise<void> = Promise.resolve();
  const profileOf = (windowId: number) => running.of(windowId);
  const idsOf = (runtime: ProfileRuntime) => runtime.windows.map((window) => window.webContents.id);
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
  cleanups.add((windowId) => warm.closeWindow(windowId));
  const reads = new ReadIdentities(fs);
  // The window's tabs: links and reads forget each before the registry lets the window go.
  cleanups.add((windowId) => {
    for (const tab of documents.list(windowId)) {
      links.forget(tab.id);
      reads.forget(tab.id);
    }
    documents.closeWindow(windowId);
  });
  const crashes = new CrashRecovery(Date.now);
  cleanups.add((windowId) => crashes.closeWindow(windowId));
  // The tab the reader is dragging, which another window may take once (ADR-019).
  const drags = new TabDrags();
  cleanups.add((windowId) => drags.end(windowId) && broadcastDragging(false));
  /** Windows closing because their last tab moved away: their profile's session keeps no empty window. */
  const emptiedByMove = new Set<number>();
  cleanups.add((windowId) => emptiedByMove.delete(windowId));
  // Closing, quitting or deleting a profile with unsaved changes asks the reader first (ADR-013).
  const unsaved = new UnsavedChanges({
    dirty: (windowId) => grants.dirty(windowId),
    ask: (windowId, ids) => {
      windowOf(windowId)?.focus();
      sendTo(windowId, 'documents.confirmClose', ids);
    },
    force: (windowId) => confirmCloseUnsaved(windowId),
    clock: systemClock,
    ackMs: UNSAVED_ACK_MS,
  });
  cleanups.add((windowId) => unsaved.closeWindow(windowId));
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
  cleanups.add((windowId) => selections.closeWindow(windowId));
  const quickOpen = new QuickOpen({
    fs,
    clock: systemClock,
    grants: selections,
    home: app.getPath('home'),
    onUpdate: (windowId, results) => sendTo(windowId, 'quickOpen.results', results),
  });
  cleanups.add((windowId) => quickOpen.close(windowId));
  const drops = new DropGrants(randomUUID);
  cleanups.add((windowId) => drops.closeWindow(windowId));
  /** A folder dropped on the window, which its next quick open searches. */
  const droppedFolders = new Map<number, string>();
  cleanups.add((windowId) => droppedFolders.delete(windowId));
  /**
   * Shows files in the window: their tabs if it has them (whatever the case of their names, when it's
   * the same file), else new ones after the shown one (or `after`).
   */
  const openInWindow = async (windowId: number, files: readonly string[], after?: string | null, chosen = false) => {
    const named = await spelledAsOpen(fs, documents, windowId, files);
    if (!profileOf(windowId)) return;
    openFiles(documents, windowId, named, after, { chosen });
    // Main showed the tab itself, so the page won't report it: the warm set hears it here.
    const shown = documents.snapshot(windowId).active;
    if (files.length > 0 && shown) {
      const ids = warm.activated(windowId, shown);
      if (ids.length > 0) demote(windowId, ids);
    }
  };
  // Profiles `--profile` created, by the token their window's notice carries, until Undo or the window goes.
  const undoable = new Map<string, { profile: string; name: string; files: readonly string[]; window: number }>();
  cleanups.add((windowId) => {
    for (const [token, created] of undoable) if (created.window === windowId) undoable.delete(token);
  });

  const lockdown = networkLockdown(runtime);
  registerSchemes();
  lockDownBackgroundNetworking(lockdown.resolver ? hostResolverRules(devServerOrigin(runtime)) : null);

  /** The name of the window's shown tab: its file's, or Settings. */
  const shownFile = (windowId: number) => {
    const { tabs, active } = documents.snapshot(windowId);
    const shown = tabs.find((tab) => tab.id === active);
    return !shown ? null : shown.kind === 'settings' ? 'Settings' : path.basename(shown.path);
  };
  /** `<file> — <profile> — galeo`, from the window's shown tab (UX). */
  const updateTitle = (profile: ProfileRuntime, windowId: number) => {
    const window = profile.window(windowId);
    window?.setTitle(windowTitle([shownFile(windowId), profile.name], { sandboxed }));
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
    focusOrder.front(windowId);
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
    followBounds(window, () => profile.keeper.changed());
    trackFocus(window, {
      order: focusOrder,
      focused: () => {
        rememberProfile(profile.id);
        profile.keeper.changed();
      },
      warm,
      tabs: documents,
      reads,
      stale: (id) => sendTo(windowId, 'tabs.stale', id),
    });
    guardClose(window, {
      quitting: () => quitting,
      profile,
      dirty: (id) => grants.dirty(id),
      confirm: (ids) => unsaved.confirm(ids),
      emptiedByMove: (id) => emptiedByMove.has(id),
      tabs: documents,
      bounds: () => windowBounds(window),
    });
    countInput(window, input);
    recoverOnCrash(window, { quitting: () => quitting, recover: (crashed, reason) => windowCrash.recover(crashed, reason) });
    window.on('closed', () => {
      profile.windows.splice(profile.windows.indexOf(window), 1);
      // Out of its profile first: the registry's change on letting the window go looks its profile up.
      cleanups.run(windowId);
      // A quit saves every running profile itself, before its windows close.
      if (quitting) return;
      if (profile.windows.length > 0) profile.keeper.changed();
      else running.stop(profile);
    });
    perfMark('window-created');
    // Asked once the page has loaded: a launch's files are in the window by then.
    reportColdStart(window, { document: () => documents.list(windowId).length > 0 });
    return window;
  };

  const windowCrash = windowCrashes({
    crashes,
    tabs: documents,
    warm,
    reads,
    grants,
    ...(app.isPackaged
      ? {}
      : {
          forTests: {
            crashOn: () => testHooks.__galeoCrashOnRendering,
            seen: (path: string) => void (testHooks.__galeoRenderingSeen ??= []).push(path),
            // Killed by the OS, after the report: forcefullyCrashRenderer can leave a renderer hung
            // instead of gone (seen on a Linux CI runner), and then main never hears it went.
            kill: (windowId: number) => {
              const contents = webContents.fromId(windowId);
              if (contents) setImmediate(() => process.kill(contents.getOSProcessId(), 'SIGKILL'));
            },
          },
        }),
  });

  /** The profile last worked in, where launches go when no window is open (ADR-005). */
  const rememberProfile = (id: string) => void appState.setLastProfile(id).catch((error: unknown) => console.warn('galeo: app state not saved', error));

  /** A profile's runtime, with its settings' listeners. */
  const createRuntime = async (id: string): Promise<ProfileRuntime> => {
    const name = (await catalog.list()).find((each) => each.id === id)?.name ?? id;
    const profile = new ProfileRuntime(id, name, { fs, utf8, watcher, clock: systemClock, paths, tabs: documents, focusOrder: () => focusOrder.ids() });
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
    return profile;
  };

  const startRuntime = async (id: string): Promise<ProfileRuntime> => {
    // A profile starting again reads its session only once its last save has landed.
    const profile = await running.start(id);
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
      .ids()
      .filter((id) => id !== windowId)
      .flatMap((id) => {
        const profile = profileOf(id);
        if (!profile) return [];
        return [{ window: id, profile: profile.name, accent: accents.get(profile.id) ?? null, shows: shownFile(id) }];
      });
  };

  /** What routing sees; `without` leaves a profile out (an undone creation). */
  const world = async (without?: string): Promise<RouteWorld> => ({
    profiles: (await catalog.list()).filter((profile) => profile.id !== without),
    windows: [...running.values()]
      .filter((profile) => profile.id !== without)
      .flatMap((profile) => idsOf(profile).map((id) => ({ id, profile: profile.id }))),
    focusOrder: focusOrder.ids(),
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
    if (typeof decision.window === 'number') window = profile.window(decision.window)!;
    else if (decision.window === 'new' || !window) {
      await themeSettled;
      window = openMainWindow(profile);
      fresh = true;
    }
    const windowId = window.webContents.id;
    await openInWindow(windowId, files, undefined, chosen);
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
      await running.stopped(id);
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
    void running.quit().finally(() => {
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
    const fonts = process.platform === 'linux' ? new FcListFontCatalog() : new EmptyFontCatalog();
    registerIpc(
      {
        ...appHandlers({
          info: (windowId) => ({ ...startInfo(), crashLoop: crashes.gaveUp(windowId) }),
          sandboxChoice: {
            offered: () => mode.kind === 'sandbox-unavailable',
            quit: () => app.quit(),
            proceed: () => {
              mode = { kind: 'normal' };
              acceptOpenRequests();
              // Closed once the launch's window is open: the app quits when its last window closes.
              void enqueue(async () => choiceWindow?.close()).catch(() => {});
            },
          },
          launcher: {
            input,
            fs,
            utf8,
            appImage,
            home: app.getPath('home'),
            execDir: path.dirname(process.execPath),
            resourcesDir: process.resourcesPath,
            env: process.env,
            // Fixed program and arguments; the folder is the user's own MIME database.
            refreshMime: (database) => runFile('update-mime-database', [database], { timeout: 30_000, maxBuffer: 1024 * 1024 }).then(() => undefined),
          },
        }),
        ...profileHandlers({
          profileOf,
          state: profilesState,
          profileIds: async () => (await catalog.list()).map((profile) => profile.id),
          enqueue,
          open: (id) => openRouted({ profile: id, newWindow: false }, []),
          create: createProfile,
          update: updateProfile,
          remove: (id) => removeProfile(id, []),
          undoable,
          undo: undoCreate,
          input,
          unsaved,
        }),
        ...sessionHandlers({
          profileOf,
          ready: () => mode.kind === 'normal',
          tabs: documents,
          openWindow: (profile, window) => openMainWindow(profile, window),
        }),
        ...windowHandlers({
          windowOf: (windowId) => {
            const profile = profileOf(windowId);
            const window = profile?.window(windowId);
            return profile && window ? { profile, window } : undefined;
          },
          command: (command, { profile, window }) => mainKey(command, profile, window),
          crashes,
          reload: ({ window }) => windowCrash.reload(window, { activate: true }),
        }),
        ...settingsHandlers({ profileOf, fonts, configDir: paths.configDir, files: { fs, shell, utf8 } }),
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
          searches,
          menus,
        }),
        ...tabHandlers({
          tabs: documents,
          warm,
          reads,
          crashes: windowCrash.reports,
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
          tellDragging: (window) => sendTo(window, 'tabs.dragging', true),
          after: (ms, run) => void setTimeout(run, ms),
          home: app.getPath('home'),
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
            else await openInWindow(windowId, [file]);
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

/**
 * Makes the window ask for attention without raising it (ADR-005): on Wayland an activation request,
 * which GNOME refuses for a window that isn't the reader's focus and turns into its "galeo is ready"
 * notice; elsewhere the taskbar entry flashes until the window is focused. Unpackaged test runs
 * count the requests in `globalThis.__galeoAttention`, since a headless desktop shows none.
 */
function requestAttention(window: BrowserWindow): void {
  const how = attentionRequest({
    platform: process.platform,
    ozonePlatform: app.commandLine.getSwitchValue('ozone-platform'),
    waylandDisplay: Boolean(process.env['WAYLAND_DISPLAY']),
  });
  if (how === 'activate') window.focus();
  else window.flashFrame(true);
  if (!app.isPackaged) {
    (testHooks.__galeoAttention ??= []).push(window.webContents.id);
  }
}

/**
 * Config files galeo can't use are left untouched (SR-17). Until windows can show the notice,
 * main logs it; unpackaged test runs read the latest list as `globalThis.__galeoSettingsNotices`.
 */
function reportSettingsNotices(notices: readonly SettingsNotice[]): void {
  for (const notice of notices) console.warn(`galeo: ${notice.path} left untouched (${notice.reason}): ${notice.detail ?? ''}`);
  if (!app.isPackaged) testHooks.__galeoSettingsNotices = notices;
}

/** How recently a session's window was focused: 0 for the last focused, higher for older ones. */
function rank(session: SessionFile, index: number): number {
  const at = session.focusOrder.indexOf(index);
  return at < 0 ? session.focusOrder.length + index : at;
}

/**
 * A session file galeo couldn't use was backed up and replaced by the newest valid snapshot
 * (SR-17). Logged; the window says so too (`sessionNotice`).
 */
function reportSessionNotice(notice: SettingsNotice): void {
  console.warn(`galeo: ${notice.path} was invalid (${notice.reason}); restored the newest valid snapshot`);
}

/** Capability keys main took before the page saw them. Unpackaged test runs read `globalThis.__galeoCapabilityKeys`. */
function recordCapabilityKey(command: Command): void {
  if (!app.isPackaged) (testHooks.__galeoCapabilityKeys ??= []).push(command);
}

/** The window with this page id, if it is still open. */
function windowOf(windowId: number): BrowserWindow | null {
  const contents = webContents.fromId(windowId);
  return contents ? BrowserWindow.fromWebContents(contents) : null;
}

/** A native message box over the window, or on its own once the window is gone; the button pressed. */
async function ask(windowId: number, options: MessageBoxOptions): Promise<number> {
  const owner = windowOf(windowId);
  const { response } = owner ? await dialog.showMessageBox(owner, options) : await dialog.showMessageBox(options);
  return response;
}

/** Asks, in a native dialog the page can't answer for itself, whether a burst of opens may go on. */
async function confirmBurst(windowId: number): Promise<boolean> {
  const answer = !app.isPackaged ? process.env['GALEO_TEST_BURST_ANSWER'] : undefined;
  if (answer) return answer === 'allow';
  const response = await ask(windowId, {
    type: 'question',
    message: 'This document is opening many links. Allow?',
    buttons: ['Allow', 'Block for this tab'],
    defaultId: 1,
    cancelId: 1,
  });
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
    (testHooks.__galeoEditAsked ??= []).push(file);
    return answer === 'edit';
  }
  const response = await ask(windowId, {
    type: 'question',
    message: `Edit "${path.basename(file)}"?`,
    detail: `${file}\n\nThis file was opened from a link, a drop, quick open or recent files. galeo asks once before editing a file you didn't open from the desktop or the command line.`,
    buttons: ['Edit', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
  });
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
  const response = await ask(windowId, {
    type: 'warning',
    message: 'This window is still asking about unsaved changes.',
    detail: 'Close it without saving? Its unsaved changes will be lost.',
    buttons: ['Keep waiting', 'Close without saving'],
    defaultId: 0,
    cancelId: 0,
  });
  return response === 1;
}

/**
 * The desktop hand-offs. Unpackaged test runs can record them instead of starting other apps
 * (`GALEO_TEST_EXTERNAL=record`, read as `globalThis.__galeoOpenedExternal`, `__galeoOpenedPaths` and
 * `__galeoRevealed`).
 */
function externalShell(): OsShell {
  if (app.isPackaged || process.env['GALEO_TEST_EXTERNAL'] !== 'record') return new ElectronOsShell();
  return new RecordingOsShell((testHooks.__galeoOpenedExternal ??= []), (testHooks.__galeoRevealed ??= []), (testHooks.__galeoOpenedPaths ??= []));
}

/**
 * Cancelled requests, readable by end-to-end tests from the main process as
 * `globalThis.__galeoBlockedRequests`. Unpackaged builds only.
 */
function recordBlockedRequest(url: string): void {
  if (!app.isPackaged) (testHooks.__galeoBlockedRequests ??= []).push(url);
}
