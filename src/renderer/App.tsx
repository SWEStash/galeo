import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TabPanel, Tabs } from 'react-aria-components';
import type { AppInfo, SandboxChoice } from '../shared/contracts';
import type { ReaderWidth } from '../shared/tabs';
import { AboutDialog } from './about/AboutDialog';
import type { Command, Platform } from '../shared/keymap';
import { CommandsProvider, useCommands, useDispatcher } from './commands/useCommands';
import type { PaletteEntry } from './palette/entries';
import { Palette } from './palette/Palette';
import { OutlineProvider } from './outline/useOutline';
import { useColorScheme } from './document/theme';
import { markFirstPaint } from './perf';
import { ProfileCreatedNotice } from './profiles/ProfileCreatedNotice';
import { SessionNotice, SettingsNotice } from './settings/SettingsNotice';
import { settingsTokens } from './settings/tokens';
import { setCustomCss } from './document/host';
import { ProfileChip } from './profiles/ProfileChip';
import { useProfiles } from './profiles/useProfiles';
import { accentOf } from '../shared/accents';
import { useSettings } from './settings/useSettings';
import { CrashLoop, SandboxUnavailable, UnsandboxedBadge } from './StartupScreens';

// The Settings tab loads when first shown: its pickers are nothing a window needs to start.
const SettingsView = lazy(() => import('./settings/SettingsView').then((module) => ({ default: module.SettingsView })));
import { hasReadingColumn, readerWidthStyle } from './document/width';
import { tabAction } from './tabs/commands';
import type { TabStore } from './tabs/store';
import { EmptyWindow } from './tabs/EmptyWindow';
import { MoveTabDialog } from './tabs/MoveTabDialog';
import { ignoreClosedTab } from './tabs/closed-tab';
import { editors } from './edit/editors';
import { StatusBar } from './tabs/StatusBar';
import { TabBar } from './tabs/TabBar';
import { TabDocument } from './tabs/TabDocument';
import { useTabs } from './tabs/useTabs';
import { UnsavedPrompt, useConfirmUnsaved } from './edit/UnsavedPrompt';
import { wheelZoom } from './tabs/wheel-zoom';
import { QuickOpen } from './quick-open/QuickOpen';
import { DropArea } from './tabs/DropArea';
import { useFileDrops } from './tabs/useFileDrops';
import { createRenderClient, type RenderClient } from './worker/client';
import { spawnRenderWorker } from './worker/spawn';

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void window.galeo.app.info().then((next) => {
      document.documentElement.dataset['platform'] = next.platform;
      setInfo(next);
    });
  }, []);

  const choose = useCallback((choice: SandboxChoice) => {
    void window.galeo.app.resolveSandboxUnavailable(choice);
  }, []);

  if (!info) return null;
  if (info.sandboxUnavailable) return <SandboxUnavailable cause={info.sandboxUnavailable} onChoose={choose} />;
  if (info.crashLoop) return <CrashLoop onRetry={() => void window.galeo.window.retryAfterCrashes()} onClose={() => void window.galeo.window.command('closeWindow')} />;
  return (
    <CommandsProvider platform={info.platform}>
      <OutlineProvider>
        <UnsavedPrompt>
          <MainView sandboxed={info.sandboxed} platform={info.platform} appImage={info.appImage} version={info.version} />
        </UnsavedPrompt>
      </OutlineProvider>
    </CommandsProvider>
  );
}

/** Status-bar messages go away on their own. */
const MESSAGE_MS = 4000;

function MainView({ sandboxed, platform, appImage, version }: { sandboxed: boolean; platform: Platform; appImage: boolean; version: string }) {
  const [workerReady, setWorkerReady] = useState(false);
  const [client, setClient] = useState<RenderClient | null>(null);
  const { view, store } = useTabs();
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
  const [message, setMessage] = useState<string | null>(null);

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

  // One overlay at a time: quick open, the palette, About or the windows a tab can move to.
  const [overlay, setOverlay] = useState<'quickOpen' | 'palette' | 'about' | 'moveTab' | null>(null);
  const openQuickOpen = useCallback(() => setOverlay('quickOpen'), []);
  // Where focus goes when the overlay closes, if not the document: About from the profile menu, whose item is gone.
  const returnFocus = useRef<string | null>(null);
  const closeOverlay = useCallback(() => {
    setOverlay(null);
    const to = returnFocus.current ?? '[data-testid="tab-panel"][data-active="true"] [data-testid="document"]';
    returnFocus.current = null;
    // Focus goes back to the document being read (UX F8), once the dialog has let it go.
    requestAnimationFrame(() => document.querySelector<HTMLElement>(to)?.focus());
  }, []);
  useTabShortcuts(store, openQuickOpen, settings?.settings.measure ?? 72, setMessage);
  useUnsavedGuards(store);
  useCommands({
    commandPalette: () => setOverlay('palette'),
    moveTabToWindow: () => {
      const shown = movableTab(store, setMessage);
      if (shown) setOverlay('moveTab');
      return shown !== undefined;
    },
  });
  const moveToChosenWindow = useCallback(
    (target: number) => {
      const id = store.getSnapshot().active;
      closeOverlay();
      if (id) moveShownTab(id, target, setMessage);
    },
    [store, closeOverlay],
  );
  const [recentRevision, setRecentRevision] = useState(0);
  const openAbout = useCallback((from: string | null = null) => {
    returnFocus.current = from;
    setOverlay('about');
  }, []);
  const runEntry = usePaletteActions(store, setMessage, () => setRecentRevision((revision) => revision + 1), openAbout);
  const choose = useCallback(
    (entry: PaletteEntry) => {
      closeOverlay();
      // After the focus is back in the document, so a command that moves it (find) keeps it.
      requestAnimationFrame(() => runEntry(entry));
    },
    [closeOverlay, runEntry],
  );
  const { landed } = useFileDrops(openQuickOpen);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <>
      <Tabs
        className="window"
        // Null only while the window has no tabs; no tab has the empty key.
        selectedKey={view.active ?? ''}
        onSelectionChange={(key) => store.activate(String(key))}
        keyboardActivation="manual"
      >
        <TabBar view={view} store={store} start={profiles && <ProfileChip state={profiles} onAbout={() => openAbout('[data-testid="profile-chip"]')} />} onOpenFile={openQuickOpen} onFilesDropped={(after) => landed({ after })} />
        <ProfileCreatedNotice />
        {settings && <SettingsNotice notices={settings.notices} />}
        {settings && <SessionNotice notice={settings.session} />}
        <main data-testid="app-root" data-worker={workerReady ? 'ready' : 'starting'}>
          <DropArea onDrop={() => landed({})}>
            {view.revision >= 0 && view.tabs.length === 0 && <EmptyWindow key={recentRevision} platform={platform} />}
            {view.tabs.map((tab) => (
              // Tabs not shown stay mounted (warm): hidden and inert, so switching back shows them as they were.
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
                      <SettingsView state={settings} profile={profile} appImage={appImage} version={version} onAbout={() => openAbout()} />
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
                    platform={platform}
                    scheme={scheme}
                    onMessage={setMessage}
                    tableDefaults={tableDefaults}
                  />
                )}
              </TabPanel>
            ))}
          </DropArea>
        </main>
        {settings?.settings.statusBar !== false && (
          <StatusBar view={view} store={store}>
            <span className="status-message" data-testid="status-message" role="status">
              {message ?? ''}
            </span>
            {!sandboxed && <UnsandboxedBadge />}
          </StatusBar>
        )}
      </Tabs>
      {/* Outside the tabs: their collection is built by rendering their children once more. */}
      {overlay === 'quickOpen' && <QuickOpen platform={platform} onClose={closeOverlay} />}
      {overlay === 'palette' && <Palette platform={platform} onChoose={choose} onClose={closeOverlay} />}
      {overlay === 'about' && <AboutDialog version={version} onClose={closeOverlay} />}
      {overlay === 'moveTab' && <MoveTabDialog onChoose={moveToChosenWindow} onClose={closeOverlay} />}
    </>
  );
}

/**
 * Unsaved changes (ADR-013): closing a dirty tab asks first, and so does main before it closes the
 * window, quits or deletes the profile, one dirty tab at a time, showing each.
 */
function useUnsavedGuards(store: TabStore) {
  const confirm = useConfirmUnsaved();
  useEffect(() => {
    const nameOf = (id: string) => store.getSnapshot().tabs.find((tab) => tab.id === id)?.path.split('/').pop() ?? 'this file';
    const ask = (id: string) => confirm(id, nameOf(id));
    store.setCloseGuard(ask);
    const stop = window.galeo.documents.onConfirmClose((ids) => {
      void window.galeo.documents.closeAnswer('asking');
      void (async () => {
        for (const id of ids) {
          store.activate(id);
          if (!(await ask(id))) return window.galeo.documents.closeAnswer('cancel');
        }
        await window.galeo.documents.closeAnswer('proceed');
      })();
    });
    return () => {
      stop();
      store.setCloseGuard(null);
    };
  }, [store, confirm]);
}

/**
 * The shown tab, if it can move to another window: the settings tab stays (UX F15). Undefined when
 * no tab is shown; null, said why, for the settings tab.
 */
function movableTab(store: TabStore, say: (message: string) => void): string | null | undefined {
  const view = store.getSnapshot();
  const shown = view.tabs.find((tab) => tab.id === view.active);
  if (!shown) return undefined;
  if (shown.kind !== 'settings') return shown.id;
  say('The Settings tab stays in its window');
  return null;
}

/** Moves the tab to another window or a new one (ADR-019), its unsaved text handed to main first. */
function moveShownTab(id: string, target: number | 'new', say: (message: string) => void) {
  editors.get(id)?.keepNow();
  void window.galeo.tabs.moveTo(id, target).then((moved) => {
    if (!moved) say("The tab didn't move");
  }, ignoreClosedTab);
}

/** The tab shortcuts, per-tab zoom and reader width (UX §5), wherever the focus is. */
function useTabShortcuts(store: TabStore, openQuickOpen: () => void, measure: ReaderWidth, say: (message: string) => void) {
  // The store's state as of the key, not of the last render: keys can come faster than renders.
  const active = () => store.getSnapshot().active;
  const zoom = (direction: 'in' | 'out' | 'reset') => () => {
    const id = active();
    if (!id) return false;
    store.zoom(id, direction);
    return true;
  };
  const width = (direction: 'wider' | 'narrower' | 'reset' | 'full') => () => {
    const id = active();
    if (!id) return false;
    if (!hasReadingColumn(store.getSnapshot().statuses.get(id))) say('Reader width applies to the rendered view');
    else store.width(id, direction, measure);
    return true;
  };
  const tabs = (command: Command) => ({ tabNumber }: { tabNumber: number | null }) => {
    const action = tabAction(command, tabNumber, store.getSnapshot());
    if (!action) return false;
    if (action.kind === 'activate') store.activate(action.id);
    else if (action.kind === 'move') store.move(action.id, action.position);
    else if (action.kind === 'close') store.close(action.id);
    else store.reopenClosed();
    return true;
  };
  // Ctrl and the wheel zoom too, unless something under the pointer took the wheel (the viewer).
  useEffect(() => {
    let pending = 0;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || event.defaultPrevented) return;
      event.preventDefault();
      const turned = wheelZoom(pending, event);
      pending = turned.pending;
      if (turned.step) zoom(turned.step)();
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [store]);
  useCommands({
    zoomIn: zoom('in'),
    zoomOut: zoom('out'),
    zoomReset: zoom('reset'),
    widenReader: width('wider'),
    narrowReader: width('narrower'),
    resetReaderWidth: width('reset'),
    fullWidth: width('full'),
    quickOpen: openQuickOpen,
    reload: () => {
      const id = active();
      if (!id) return false;
      store.reread(id);
      return true;
    },
    settings: () => void window.galeo.tabs.openSettings(),
    nextTab: tabs('nextTab'),
    previousTab: tabs('previousTab'),
    goToTab: tabs('goToTab'),
    goToLastTab: tabs('goToLastTab'),
    moveTabLeft: tabs('moveTabLeft'),
    moveTabRight: tabs('moveTabRight'),
    moveTabToNewWindow: () => {
      const id = movableTab(store, say);
      if (id === undefined) return false;
      if (id === null) return true;
      if (store.getSnapshot().tabs.length < 2) say("It's this window's only tab");
      else moveShownTab(id, 'new', say);
      return true;
    },
    closeTab: tabs('closeTab'),
    reopenClosed: tabs('reopenClosed'),
  });
}

/** What a palette entry does in this window, besides running a command. */
function usePaletteActions(store: TabStore, say: (message: string) => void, recentCleared: () => void, openAbout: () => void) {
  const dispatcher = useDispatcher();
  return useCallback(
    (entry: PaletteEntry) => {
      const { action } = entry;
      if (action.kind === 'command') {
        if (!dispatcher.run(action.command, { typing: false, tabNumber: action.tabNumber ?? null })) say(`${entry.label} isn't available here`);
      } else if (action.kind === 'main') void window.galeo.window.command(action.command);
      else if (action.kind === 'hint') say(action.message);
      else if (action.kind === 'openWithDefaultApp') {
        const view = store.getSnapshot();
        const shown = view.tabs.find((tab) => tab.id === view.active);
        if (shown && shown.kind !== 'settings') void window.galeo.documents.contextMenu(shown.id);
        else say('No document is shown');
      } else if (action.kind === 'restorePrevious') {
        void window.galeo.session.previous().then(([latest]) => {
          if (latest) void window.galeo.session.restorePrevious(latest.snapshot);
          else say('No previous session to restore');
        });
      } else if (action.kind === 'about') openAbout();
      else {
        void window.galeo.recent.clear().then(() => {
          recentCleared();
          say('Recent files cleared');
        });
      }
    },
    [dispatcher, store, say, recentCleared, openAbout],
  );
}
