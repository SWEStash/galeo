import { useCallback, useEffect, useState } from 'react';
import type { AppInfo, SandboxChoice } from '../shared/contracts';
import { DocumentView } from './document/DocumentView';
import type { ColorScheme } from './document/host';
import { useColorScheme } from './document/theme';
import { useFirstDocument } from './document/useFirstDocument';
import { markFirstPaint } from './perf';
import { SandboxUnavailable, UnsandboxedBadge } from './StartupScreens';
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
  return <MainView sandboxed={info.sandboxed} scheme={scheme} />;
}

function MainView({ sandboxed, scheme }: { sandboxed: boolean; scheme: ColorScheme }) {
  const [workerReady, setWorkerReady] = useState(false);
  const [client, setClient] = useState<RenderClient | null>(null);
  const shown = useFirstDocument(client);

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

  return (
    <>
      <main data-testid="app-root" data-worker={workerReady ? 'ready' : 'starting'}>
        {shown?.kind === 'rendered' && <DocumentView html={shown.html} scheme={scheme} />}
        {shown?.kind === 'content' && (
          // Placeholder until the source, text and log views and the document states exist.
          <p data-testid="document-state" data-state={shown.content.state}>
            {shown.content.path}
          </p>
        )}
      </main>
      <footer className="status-bar">{!sandboxed && <UnsandboxedBadge />}</footer>
    </>
  );
}
