// Render worker entry: one per window, parsing and highlighting only (no DOM, no IPC; ADR-003).
import { createMessageHandler } from './handler';
import { createRenderer } from './pipeline/render';

const handle = createMessageHandler(createRenderer(), (reply) => self.postMessage(reply));
self.addEventListener('message', (event: MessageEvent<unknown>) => void handle(event.data));
