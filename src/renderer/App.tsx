import { useCallback, useEffect, useState } from 'react';
import type { AppInfo, SandboxChoice } from '../shared/contracts';
import { useColorScheme } from './document/theme';
import { markFirstPaint } from './perf';
import { SandboxUnavailable, UnsandboxedBadge } from './StartupScreens';
import { spawnRenderWorker } from './worker/spawn';

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useColorScheme();

  useEffect(() => {
    void window.galeo.app.info().then(setInfo);
  }, []);

  const choose = useCallback((choice: SandboxChoice) => {
    void window.galeo.app.resolveSandboxUnavailable(choice);
  }, []);

  if (!info) return null;
  if (info.sandboxUnavailable) return <SandboxUnavailable cause={info.sandboxUnavailable} onChoose={choose} />;
  return <MainView sandboxed={info.sandboxed} />;
}

function MainView({ sandboxed }: { sandboxed: boolean }) {
  const [workerReady, setWorkerReady] = useState(false);

  useEffect(markFirstPaint, []);

  useEffect(() => {
    const worker = spawnRenderWorker();
    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (event.data === 'ready') setWorkerReady(true);
    });
    worker.postMessage('ping');
    return () => worker.terminate();
  }, []);

  return (
    <>
      <main data-testid="app-root" data-worker={workerReady ? 'ready' : 'starting'} />
      <footer className="status-bar">{!sandboxed && <UnsandboxedBadge />}</footer>
    </>
  );
}
