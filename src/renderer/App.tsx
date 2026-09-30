import { useCallback, useEffect, useState } from 'react';
import { TabPanel, Tabs } from 'react-aria-components';
import type { AppInfo, SandboxChoice } from '../shared/contracts';
import { commandFor, tabNumberFor, type Platform } from '../shared/keymap';
import { useColorScheme } from './document/theme';
import { markFirstPaint } from './perf';
import { ProfileCreatedNotice } from './profiles/ProfileCreatedNotice';
import { SessionNotice, SettingsNotice } from './settings/SettingsNotice';
import { settingsTokens } from './settings/tokens';
import { SettingsView } from './settings/SettingsView';
import { setCustomCss } from './document/host';
import { ProfileChip } from './profiles/ProfileChip';
import { useProfiles } from './profiles/useProfiles';
import { accentOf } from '../shared/accents';
import { useSettings } from './settings/useSettings';
import { SandboxUnavailable, UnsandboxedBadge } from './StartupScreens';
import { tabAction } from './tabs/commands';
import type { TabStore } from './tabs/store';
import { EmptyWindow } from './tabs/EmptyWindow';
import { StatusBar } from './tabs/StatusBar';
import { TabBar } from './tabs/TabBar';
import { TabDocument } from './tabs/TabDocument';
import { useTabs } from './tabs/useTabs';
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
  return <MainView sandboxed={info.sandboxed} platform={info.platform} appImage={info.appImage} />;
}

/** Status-bar messages go away on their own. */
const MESSAGE_MS = 4000;

function MainView({ sandboxed, platform, appImage }: { sandboxed: boolean; platform: Platform; appImage: boolean }) {
  const [workerReady, setWorkerReady] = useState(false);
  const [client, setClient] = useState<RenderClient | null>(null);
  const { view, store } = useTabs();
  const settings = useSettings();
  const scheme = useColorScheme(settings?.settings.themeMode ?? 'system');

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
    const worker = spawnRenderWorker();
    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (event.data === 'ready') setWorkerReady(true);
    });
    worker.postMessage('ping');
    setClient(createRenderClient(worker));
    return () => worker.terminate();
  }, []);

  useTabShortcuts(store, platform);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <Tabs
      className="window"
      // Null only while the window has no tabs; no tab has the empty key.
      selectedKey={view.active ?? ''}
      onSelectionChange={(key) => store.activate(String(key))}
      keyboardActivation="manual"
    >
      <TabBar view={view} store={store} start={profiles && <ProfileChip state={profiles} platform={platform} />} />
      <ProfileCreatedNotice />
      {settings && <SettingsNotice notices={settings.notices} />}
      {settings && <SessionNotice notice={settings.session} />}
      <main data-testid="app-root" data-worker={workerReady ? 'ready' : 'starting'}>
        {view.revision >= 0 && view.tabs.length === 0 && <EmptyWindow platform={platform} />}
        {view.tabs.map((tab) => (
          // Tabs not shown stay mounted (warm): hidden and inert, so switching back shows them as they were.
          <TabPanel key={tab.id} id={tab.id} shouldForceMount className="tab-panel" data-testid="tab-panel" data-active={tab.id === view.active}>
            {tab.kind === 'settings' ? (
              settings && profile && <SettingsView state={settings} profile={profile} appImage={appImage} />
            ) : (
              <TabDocument
                id={tab.id}
                active={tab.id === view.active}
                rendered={view.rendered.has(tab.id)}
                staleReads={view.reads.get(tab.id) ?? 0}
                zoom={view.zooms.get(tab.id) ?? 1}
                store={store}
                client={client}
                platform={platform}
                scheme={scheme}
                onMessage={setMessage}
              />
            )}
          </TabPanel>
        ))}
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
  );
}

/** The tab shortcuts and per-tab zoom (UX §5), wherever the focus is. */
function useTabShortcuts(store: TabStore, platform: Platform) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // The store's state as of this key, not of the last render: keys can come faster than renders.
      const view = store.getSnapshot();
      const command = commandFor(event, platform);
      const zoom = command === 'zoomIn' ? 'in' : command === 'zoomOut' ? 'out' : command === 'zoomReset' ? 'reset' : null;
      if (zoom && view.active) {
        event.preventDefault();
        store.zoom(view.active, zoom);
        return;
      }
      if (command === 'reload' && view.active) {
        event.preventDefault();
        store.reread(view.active);
        return;
      }
      if (command === 'settings') {
        event.preventDefault();
        void window.galeo.tabs.openSettings();
        return;
      }
      const action = command && tabAction(command, tabNumberFor(event, platform), view);
      if (!action) return;
      event.preventDefault();
      if (action.kind === 'activate') store.activate(action.id);
      else if (action.kind === 'move') store.move(action.id, action.position);
      else if (action.kind === 'close') store.close(action.id);
      else store.reopenClosed();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [store, platform]);
}
