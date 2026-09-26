export function spawnRenderWorker(): Worker {
  return new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
}
