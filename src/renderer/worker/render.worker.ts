// Render worker entry: one per window, parsing and highlighting only (no DOM, no IPC; ADR-003).
import { createMessageHandler } from './handler';

const handle = createMessageHandler(
  () => import('./pipeline/render').then((pipeline) => pipeline.createRenderer()),
  (reply) => self.postMessage(reply),
);
self.addEventListener('message', (event: MessageEvent<unknown>) => void handle(event.data));
