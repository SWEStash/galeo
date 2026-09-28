import { useCallback, useEffect, useState } from 'react';
import type { AppInfo, SandboxChoice } from '../shared/contracts';
import type { Platform } from '../shared/keymap';
import type { ColorScheme } from './document/host';
import { useColorScheme } from './document/theme';
import { markFirstPaint } from './perf';
import { SettingsNotice } from './settings/SettingsNotice';
import { useSettings } from './settings/useSettings';
import { SandboxUnavailable, UnsandboxedBadge } from './StartupScreens';
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
  const { view } = useTabs();
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

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <>
      {settings && <SettingsNotice notices={settings.notices} />}
      <main data-testid="app-root" data-worker={workerReady ? 'ready' : 'starting'}>
        {view.tabs.map((tab) => (
          <TabDocument
            key={tab.id}
            id={tab.id}
            active={tab.id === view.active}
            client={client}
            platform={platform}
            scheme={scheme}
            onMessage={setMessage}
          />
        ))}
      </main>
      <footer className="status-bar">
        <span data-testid="status-message" role="status">
          {message ?? ''}
        </span>
        {!sandboxed && <UnsandboxedBadge />}
      </footer>
    </>
  );
}
