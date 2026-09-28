import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { subscriber } from '../../../src/preload/events';

describe('subscriber', () => {
  it("hands the page each payload, never Electron's IPC event", () => {
    const ipc = new EventEmitter();
    const listener = vi.fn();
    subscriber(ipc)('tabs.changed', listener);
    ipc.emit('tabs.changed', { sender: 'ipcRenderer' }, { revision: 1 });
    expect(listener).toHaveBeenCalledWith({ revision: 1 });
    expect(listener.mock.calls[0]).toHaveLength(1);
  });

  it('stops delivering once unsubscribed, leaving other listeners alone', () => {
    const ipc = new EventEmitter();
    const first = vi.fn();
    const second = vi.fn();
    const stop = subscriber(ipc)('tabs.changed', first);
    subscriber(ipc)('tabs.changed', second);
    stop();
    ipc.emit('tabs.changed', {}, 'payload');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
