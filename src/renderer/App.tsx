import { useEffect, useState } from 'react';
import { spawnRenderWorker } from './worker/spawn';

export function App() {
  const [workerReady, setWorkerReady] = useState(false);

  useEffect(() => {
    const worker = spawnRenderWorker();
    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (event.data === 'ready') setWorkerReady(true);
    });
    worker.postMessage('ping');
    return () => worker.terminate();
  }, []);

  return <main data-testid="app-root" data-worker={workerReady ? 'ready' : 'starting'} />;
}
