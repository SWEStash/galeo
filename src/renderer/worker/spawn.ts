import { workerScriptUrl } from '../security/trusted-types';
import workerUrl from './render.worker.ts?worker&url';

export function spawnRenderWorker(): Worker {
  return new Worker(workerScriptUrl(workerUrl), { type: 'module' });
}
