// Render worker entry. The unified pipeline runs here (ADR-003); for now it only answers the
// startup handshake.
self.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.data === 'ping') self.postMessage('ready');
});
