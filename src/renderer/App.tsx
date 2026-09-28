import { useCallback, useEffect, useState } from 'react';
import { TabPanel, Tabs } from 'react-aria-components';
import type { AppInfo, SandboxChoice } from '../shared/contracts';
import { commandFor, tabNumberFor, type Platform } from '../shared/keymap';
import type { ColorScheme } from './document/host';
import { useColorScheme } from './document/theme';
import { markFirstPaint } from './perf';
import { SettingsNotice } from './settings/SettingsNotice';
import { useSettings } from './settings/useSettings';
import { SandboxUnavailable, UnsandboxedBadge } from './StartupScreens';
import { tabAction } from './tabs/commands';
import type { TabStore, TabsView } from './tabs/store';
import { TabBar } from './tabs/TabBar';
import { TabDocument } from './tabs/TabDocument';
import { useTabs } from './tabs/useTabs';
import { createRenderClient, type RenderClient } from './worker/client';
import { spawnRenderWorker } from './worker/spawn';

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const scheme = useColorScheme();

  useEffect(() => {
    void window.galeo.app.info().then(setInfo);
  }, []);

  const choose = useCallback((choice: SandboxChoice) => {
    void window.galeo.app.resolveSandboxUnavailable(choice);
  }, []);

  if (!info) return null;
  if (info.sandboxUnavailable) return <SandboxUnavailable cause={info.sandboxUnavailable} onChoose={choose} />;
  return <MainView sandboxed={info.sandboxed} scheme={scheme} platform={info.platform} />;
}

/** Status-bar messages go away on their own. */
const MESSAGE_MS = 4000;

function MainView({ sandboxed, scheme, platform }: { sandboxed: boolean; scheme: ColorScheme; platform: Platform }) {
  const [workerReady, setWorkerReady] = useState(false);
  const [client, setClient] = useState<RenderClient | null>(null);
  const { view, store } = useTabs();
  const settings = useSettings();
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

  useTabShortcuts(view, store, platform);

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
      <TabBar view={view} store={store} />
      {settings && <SettingsNotice notices={settings.notices} />}
      <main data-testid="app-root" data-worker={workerReady ? 'ready' : 'starting'}>
        {view.tabs.map((tab) => (
          // Tabs not shown stay mounted (warm): hidden and inert, so switching back shows them as they were.
          <TabPanel key={tab.id} id={tab.id} shouldForceMount className="tab-panel" data-testid="tab-panel" data-active={tab.id === view.active}>
            <TabDocument
              id={tab.id}
              active={tab.id === view.active}
              rendered={view.rendered.has(tab.id)}
              staleReads={view.reads.get(tab.id) ?? 0}
              store={store}
              client={client}
              platform={platform}
              scheme={scheme}
              onMessage={setMessage}
            />
          </TabPanel>
        ))}
      </main>
      <footer className="status-bar">
        <span data-testid="status-message" role="status">
          {message ?? ''}
        </span>
        {!sandboxed && <UnsandboxedBadge />}
      </footer>
    </Tabs>
  );
}

/** The tab shortcuts (UX §5), wherever the focus is. */
function useTabShortcuts(view: TabsView, store: TabStore, platform: Platform) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const command = commandFor(event, platform);
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
  }, [view, store, platform]);
}
