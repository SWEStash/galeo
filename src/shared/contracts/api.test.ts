import { describe, expect, it, vi } from 'vitest';
import { buildApi } from './api';

const noSubscribe = () => () => {};

describe('buildApi', () => {
  it('exposes each channel as a method that invokes that channel only', async () => {
    const invoke = vi.fn().mockResolvedValue({ version: '1.2.3' });
    const api = buildApi(invoke, noSubscribe);

    await expect(api.app.info()).resolves.toEqual({ version: '1.2.3' });
    expect(invoke).toHaveBeenCalledWith('app.info', []);
  });

  it('exposes each event as an `on…` method that subscribes to that event only', () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn().mockReturnValue(unsubscribe);
    const api = buildApi(vi.fn(), subscribe);
    const listener = vi.fn();

    const stop = api.tabs.onChanged(listener);
    expect(subscribe).toHaveBeenCalledWith('tabs.changed', listener);
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('exposes no generic invoke, subscription or channel access', () => {
    const api = buildApi(vi.fn(), noSubscribe);

    expect(Object.keys(api)).toEqual(['app', 'documents', 'tabs', 'settings', 'session']);
    expect(Object.keys(api.app)).toEqual(['info', 'resolveSandboxUnavailable']);
    expect(Object.keys(api.documents)).toEqual(['read', 'setEncoding', 'followLink', 'back', 'forward', 'resolveImage', 'pathMenu', 'contextMenu']);
    expect(Object.keys(api.tabs)).toEqual([
      'snapshot',
      'activated',
      'rendered',
      'position',
      'zoom',
      'close',
      'reopenClosed',
      'move',
      'onChanged',
      'onDemote',
      'onStale',
    ]);
    expect(Object.keys(api.settings)).toEqual(['get', 'onChanged']);
  });
});
