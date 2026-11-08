import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TabPanel, Tabs } from 'react-aria-components';
import { accentOf } from '../shared/accents';
import type { AppInfo, SandboxChoice } from '../shared/contracts';
import type { Platform } from '../shared/keymap';
import { AboutDialog } from './about/AboutDialog';
import { movableTab, moveShownTab } from './app/tab-moves';
import { useOverlay } from './app/useOverlay';
import { usePaletteActions } from './app/usePaletteActions';
import { useTabShortcuts } from './app/useTabShortcuts';
import { useTabsPosition } from './app/useTabsPosition';
import { useTransientMessage } from './app/useTransientMessage';
import { useUnsavedGuards } from './app/useUnsavedGuards';
import { CommandsProvider, useCommands } from './commands/useCommands';
import { baselines } from './document/change-marks';
import { setCustomCss } from './document/host';
import type { FindRequest } from './document/requests';
import { useColorScheme } from './document/theme';
import { readerWidthStyle } from './document/width';
import { UnsavedPrompt } from './edit/UnsavedPrompt';
import { RightPanelProvider, useWatchPanel } from './outline/useOutline';
import type { PaletteEntry } from './palette/entries';
import { Palette } from './palette/Palette';
import { markFirstPaint, markStart } from './perf';
import { ProfileChip } from './profiles/ProfileChip';
import { ProfileCreatedNotice } from './profiles/ProfileCreatedNotice';
import { useProfiles } from './profiles/useProfiles';
import { QuickOpen } from './quick-open/QuickOpen';
import { SessionNotice, SettingsNotice } from './settings/SettingsNotice';
import { settingsTokens } from './settings/tokens';
import { useSettings } from './settings/useSettings';
import { CrashLoop, SandboxUnavailable, UnsandboxedBadge } from './StartupScreens';
import { DropArea } from './tabs/DropArea';
import { EmptyWindow } from './tabs/EmptyWindow';
import type { FindAllChoice } from './tabs/FindAll';
import { MoveTabDialog } from './tabs/MoveTabDialog';
import { StatusBar } from './tabs/StatusBar';
import { TabBar } from './tabs/TabBar';
import { showTabMenu } from './app/tab-menu';
import { installTooltips } from './app/tooltips';
import { TabDocument } from './tabs/TabDocument';
import { TabSearch } from './tabs/TabSearch';
import { useFileDrops } from './tabs/useFileDrops';
import { useTabs } from './tabs/useTabs';
import { createRenderClient, type RenderClient } from './worker/client';
import { spawnRenderWorker } from './worker/spawn';
import { logFailure, reportFailure } from './tabs/closed-tab';
import { panelOrder } from './tabs/panel-order';
import { unopenedCount, useWatch } from './watch/useWatch';
import { WATCH_PANEL_ID, WatchPanel } from './watch/WatchPanel';

// The Settings tab loads when first shown: its pickers are nothing a window needs to start.
const SettingsView = lazy(() => import('./settings/SettingsView').then((module) => ({ default: module.SettingsView })));
// Opened on demand: the grid and its drag and drop stay out of the start-up bundle.
const TabOverview = lazy(() => import('./tabs/TabOverview').then((module) => ({ default: module.TabOverview })));
const FindAll = lazy(() => import('./tabs/FindAll').then((module) => ({ default: module.FindAll })));

export function App() {
  // galeo's own tooltips, in the chrome's style, in place of the system's.
  useEffect(() => installTooltips(), []);
  // What the window's creation told the page, so a new window paints without waiting on main;
  // `app.info` follows with the crash loop, which only main knows. Main brings a crashed window back
  // by reloading it, and that page waits for `app.info`, so a crash loop never shows its tabs.
  const start = reloaded() ? null : window.galeo.app.startInfo;
  const [info, setInfo] = useState<AppInfo | null>(null);

  useLayoutEffect(() => {
    if (start) document.documentElement.dataset['platform'] = start.platform;
  }, [start]);

  useEffect(() => {
    void window.galeo.app.info().then((next) => {
      markStart('info');
      document.documentElement.dataset['platform'] = next.platform;
      setInfo(next);
    }, logFailure('reading the app info'));
  }, []);

  const choose = useCallback((choice: SandboxChoice) => {
    void window.galeo.app.resolveSandboxUnavailable(choice).catch(logFailure('the sandbox choice'));
  }, []);

  const shown: AppInfo | null = info ?? (start && { ...start, crashLoop: false });
  if (!shown) return null;
  if (shown.sandboxUnavailable) return <SandboxUnavailable cause={shown.sandboxUnavailable} onChoose={choose} />;
  if (shown.crashLoop) return <CrashLoop onRetry={() => void window.galeo.window.retryAfterCrashes().catch(logFailure('trying again'))} onClose={() => void window.galeo.window.command('closeWindow').catch(logFailure('closing the window'))} />;
  return (
    <CommandsProvider platform={shown.platform}>
      <RightPanelProvider>
        <UnsavedPrompt>
          <MainView sandboxed={shown.sandboxed} platform={shown.platform} commandLauncher={shown.commandLauncher} version={shown.version} />
        </UnsavedPrompt>
      </RightPanelProvider>
    </CommandsProvider>
  );
}

/**
 * The window's watched folder (UX F21): its state from main, whether its panel shows, and its
 * commands. A folder just watched opens the panel as main says (a restored one as it was left); the
 * panel's state goes back to main for the session.
 */
function useWatchedFolder(say: (message: string) => void) {
  const state = useWatch();
  const [open, setOpen] = useWatchPanel();
  const [focus, setFocus] = useState(false);
  const returnTo = useRef<HTMLElement | null>(null);
  const previous = useRef<typeof state>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (state && (before === null || (state.status === 'starting' && before.status !== 'starting'))) setOpen(state.panel);
    else if (!state && before) setOpen(false);
  }, [state, setOpen]);
  const watching = state !== null;
  useEffect(() => {
    if (watching) void window.galeo.watch.panel(open).catch(logFailure('keeping the panel state'));
  }, [watching, open]);
  const show = (next: boolean) => {
    if (next) returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setFocus(next);
    setOpen(next);
  };
  const close = () => {
    show(false);
    // Back where the reader was, if it is still there.
    if (returnTo.current?.isConnected) returnTo.current.focus();
  };
  const toggle = () => (open ? close() : show(true));
  useCommands({
    watchFolder: () => {
      void window.galeo.watch.choose().catch(reportFailure(say, "The folder couldn't be watched"));
      return true;
    },
    stopWatching: () => {
      if (!watching) return false;
      void window.galeo.watch.stop().catch(reportFailure(say, "Watching didn't stop"));
      return true;
    },
    toggleWatchPanel: () => {
      if (!watching) return false;
      toggle();
      return true;
    },
  });
  return { state, open, focus, toggle, close };
}

function reloaded(): boolean {
  const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  return navigation?.type === 'reload';
}

/** Status-bar messages go away on their own. */
const MESSAGE_MS = 4000;

function MainView({ sandboxed, platform, commandLauncher, version }: { sandboxed: boolean; platform: Platform; commandLauncher: boolean; version: string }) {
  const [workerReady, setWorkerReady] = useState(false);
  const [client, setClient] = useState<RenderClient | null>(null);
  const { view, store } = useTabs();
  const panelIds = useRef<string[]>([]);
  const panels = useMemo(() => {
    panelIds.current = panelOrder(panelIds.current, view.tabs.map((tab) => tab.id));
    const byId = new Map(view.tabs.map((tab) => [tab.id, tab]));
    return panelIds.current.map((id) => byId.get(id)!);
  }, [view.tabs]);
  // Change marks keep what each open tab last showed; a closed or moved-away tab's goes (ADR-030).
  useEffect(() => baselines.retain(new Set(view.tabs.map((tab) => tab.id))), [view.tabs]);
  const settings = useSettings();
  const scheme = useColorScheme(settings?.settings.themeMode ?? 'system');
  const tableSeparator = settings?.settings.tableSeparator ?? 'auto';
  const tableHeader = settings?.settings.tableHeader ?? true;
  const tableDefaults = useMemo(() => ({ separator: tableSeparator, header: tableHeader }), [tableSeparator, tableHeader]);

  // The reading settings reach documents as tokens they inherit; custom CSS only inside them (SR-17).
  useEffect(() => {
    if (!settings) return;
    for (const [token, value] of Object.entries(settingsTokens(settings.settings))) document.documentElement.style.setProperty(token, value);
    setCustomCss(settings.css);
  }, [settings]);
  const profiles = useProfiles();
  const profile = profiles?.profiles.find((each) => each.id === profiles.current);
  const accent = accentOf(profile?.accent ?? null);

  // The profile's accent colours the app chrome (the chip, the shown tab's line), never documents.
  useEffect(() => {
    document.documentElement.style.setProperty('--galeo-color-accent', accent);
  }, [accent]);
  const [message, setMessage] = useTransientMessage(MESSAGE_MS);

  useEffect(markFirstPaint, []);

  useEffect(() => {
    const client = createRenderClient(() => {
      const worker = spawnRenderWorker();
      worker.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (event.data === 'ready') setWorkerReady(true);
      });
      worker.postMessage('ping');
      return worker;
    });
    setClient(client);
    return () => client.dispose();
  }, []);

  const { overlay, openOverlay, closeOverlay, returnFocusTo } = useOverlay();
  const openQuickOpen = useCallback(() => openOverlay('quickOpen'), [openOverlay]);
  const openOverview = useCallback(() => openOverlay('tabOverview'), [openOverlay]);
  const openTabSearch = useCallback(() => openOverlay('tabSearch'), [openOverlay]);
  const openPalette = useCallback(() => openOverlay('palette'), [openOverlay]);
  const { tabsLeft, panelWidth, collapsed, setCollapsed, keepPanelWidth } = useTabsPosition(settings?.settings.tabsPosition, settings?.settings.tabPanelWidth, setMessage);
  useTabShortcuts(store, openQuickOpen, settings?.settings.measure ?? 72, setMessage);
  useUnsavedGuards(store);
  useCommands({
    commandPalette: openPalette,
    searchTabs: openTabSearch,
    tabOverview: openOverview,
    findAll: () => openOverlay('findAll'),
    moveTabToWindow: () => {
      const shown = movableTab(store, setMessage);
      if (shown) openOverlay('moveTab');
      return shown !== undefined;
    },
  });
  // Find in all tabs (ADR-024): a chosen match shows its tab with the find bar open on it, and focus
  // goes to the find bar.
  const [findRequest, setFindRequest] = useState<(FindRequest & { id: string }) | null>(null);
  const findRequests = useRef(0);
  const showMatch = useCallback(
    (id: string, choice: FindAllChoice) => {
      store.activate(id);
      if (!choice) return;
      returnFocusTo('[data-testid="tab-panel"][data-active="true"] .find-bar input');
      setFindRequest({ id, ...choice, token: ++findRequests.current });
    },
    [store, returnFocusTo],
  );
  const moveToChosenWindow = useCallback(
    (target: number) => {
      const id = store.getSnapshot().active;
      closeOverlay();
      if (id) moveShownTab(id, target, setMessage);
    },
    [store, closeOverlay],
  );
  const [recentRevision, setRecentRevision] = useState(0);
  const openAbout = useCallback(
    (from: string | null = null) => {
      returnFocusTo(from);
      openOverlay('about');
    },
    [returnFocusTo, openOverlay],
  );
  const runEntry = usePaletteActions(store, setMessage, () => setRecentRevision((revision) => revision + 1), openAbout);
  const choose = useCallback(
    (entry: PaletteEntry) => {
      closeOverlay();
      // After the focus is back in the document, so a command that moves it (find) keeps it.
      requestAnimationFrame(() => runEntry(entry));
    },
    [closeOverlay, runEntry],
  );
  const { landed } = useFileDrops(openQuickOpen, setMessage);
  const watch = useWatchedFolder(setMessage);
  // Only the slot on the page: the tabs' collection pass draws a copy that is not.
  const [watchSlot, setWatchSlot] = useState<HTMLElement | null>(null);
  const keepWatchSlot = useCallback((node: HTMLDivElement | null) => {
    if (node?.isConnected) setWatchSlot(node);
    // The copy going away must not take the slot with it.
    else if (node === null) setWatchSlot((slot) => (slot?.isConnected ? slot : null));
  }, []);

  return (
    <>
      <Tabs
        className="window"
        // The side panel lists the tabs top to bottom: ↑/↓ move between them (ADR-023).
        orientation={tabsLeft ? 'vertical' : 'horizontal'}
        // Null only while the window has no tabs; no tab has the empty key.
        selectedKey={view.active ?? ''}
        onSelectionChange={(key) => store.activate(String(key))}
        keyboardActivation="manual"
      >
        <TabBar
          view={view}
          store={store}
          start={profiles && <ProfileChip state={profiles} say={setMessage} onAbout={() => openAbout('[data-testid="profile-chip"]')} />}
          onOpenFile={openQuickOpen}
          onOverview={openOverview}
          onSearchTabs={openTabSearch}
          onCommands={openPalette}
          onFilesDropped={(after) => landed({ after })}
          onTabMenu={(id) => void showTabMenu(id, { store, say: setMessage, chooseWindow: () => openOverlay('moveTab') })}
          panel={tabsLeft ? { width: panelWidth, collapsed, onCollapsed: setCollapsed, onWidth: keepPanelWidth } : null}
          watch={watch.state && { count: unopenedCount(watch.state), open: watch.open, controls: WATCH_PANEL_ID, onToggle: watch.toggle }}
        />
        <div className="window-body">
          {/* The side panel's room: the panel itself is drawn from the title bar, where the tab list always is. */}
          {tabsLeft && <div className="side-panel-space" aria-hidden="true" />}
          <div className="document-column">
            <ProfileCreatedNotice say={setMessage} />
            {settings && <SettingsNotice notices={settings.notices} say={setMessage} />}
            {settings && <SessionNotice notice={settings.session} />}
            <main data-testid="app-root" data-worker={workerReady ? 'ready' : 'starting'}>
              <DropArea onDrop={() => landed({})}>
                {view.revision >= 0 && view.tabs.length === 0 && <EmptyWindow key={recentRevision} platform={platform} say={setMessage} />}
                {panels.map((tab) => (
                  // Tabs not shown stay mounted (warm): hidden and inert, so switching back shows them as they were.
                  // Drawn in panelOrder, so moving a tab never moves its panel (which would lose its scroll).
                  // The tab's own reader width overrides the profile's measure for everything it shows.
                  <TabPanel
                    key={tab.id}
                    id={tab.id}
                    shouldForceMount
                    className="tab-panel"
                    data-testid="tab-panel"
                    data-active={tab.id === view.active}
                    style={readerWidthStyle(view.widths.get(tab.id))}
                  >
                    {tab.kind === 'settings' ? (
                      settings &&
                      profile && (
                        <Suspense fallback={null}>
                          <SettingsView state={settings} profile={profile} launcher={commandLauncher ? platform : null} profileLauncher={platform === 'linux'} version={version} onAbout={() => openAbout()} say={setMessage} />
                        </Suspense>
                      )
                    ) : (
                      <TabDocument
                        id={tab.id}
                        active={tab.id === view.active}
                        rendered={view.rendered.has(tab.id)}
                        crashed={view.crashed.has(tab.id)}
                        path={tab.path}
                        staleReads={view.reads.get(tab.id) ?? 0}
                        zoom={view.zooms.get(tab.id) ?? 1}
                        store={store}
                        client={client}
                        scheme={scheme}
                        onMessage={setMessage}
                        tableDefaults={tableDefaults}
                        findRequest={findRequest?.id === tab.id ? findRequest : null}
                        onFindShown={() => setFindRequest(null)}
                      />
                    )}
                  </TabPanel>
                ))}
              </DropArea>
            </main>
          </div>
          {/* The watched folder panel's place; the panel is drawn from outside the tabs (below). */}
          <div className="watch-slot" ref={keepWatchSlot} />
        </div>
        {settings?.settings.statusBar !== false && (
          <StatusBar view={view} store={store} say={setMessage}>
            <span className="status-message" data-testid="status-message" role="status">
              {message ?? ''}
            </span>
            {watch.state && (
              <button type="button" className="status-watch" data-testid="status-watch" title="Watched folder (Ctrl+Shift+D)" onClick={watch.toggle}>
                Watching {watch.state.name}/{unopenedCount(watch.state) > 0 ? ` · ${unopenedCount(watch.state)} new` : ''}
              </button>
            )}
            {!sandboxed && <UnsandboxedBadge />}
          </StatusBar>
        )}
      </Tabs>
      {/* Outside the tabs: their collection is built by rendering their children once more. */}
      {watch.state && watch.open && watchSlot && createPortal(<WatchPanel state={watch.state} platform={platform} onClose={watch.close} say={setMessage} autoFocus={watch.focus} />, watchSlot)}
      {overlay === 'quickOpen' && <QuickOpen platform={platform} onClose={closeOverlay} say={setMessage} />}
      {overlay === 'tabSearch' && <TabSearch onShow={store.activate} onReopen={store.reopenClosedTab} onClose={closeOverlay} say={setMessage} updated={view.updated} />}
      {overlay === 'tabOverview' && (
        <Suspense fallback={null}>
          <TabOverview store={store} onClose={closeOverlay} onTabMenu={(id) => void showTabMenu(id, { store, say: setMessage, chooseWindow: () => openOverlay('moveTab') })} />
        </Suspense>
      )}
      {overlay === 'findAll' && (
        <Suspense fallback={null}>
          <FindAll tabs={view.tabs} onChoose={showMatch} onClose={closeOverlay} say={setMessage} />
        </Suspense>
      )}
      {overlay === 'palette' && <Palette platform={platform} onChoose={choose} onClose={closeOverlay} />}
      {overlay === 'about' && <AboutDialog version={version} onClose={closeOverlay} />}
      {overlay === 'moveTab' && <MoveTabDialog onChoose={moveToChosenWindow} onClose={closeOverlay} />}
    </>
  );
}
