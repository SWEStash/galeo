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

    expect(Object.keys(api)).toEqual(['app', 'documents', 'tabs', 'settings', 'session', 'recent', 'drops', 'quickOpen', 'profiles', 'window']);
    expect(Object.keys(api.window)).toEqual(['command', 'retryAfterCrashes']);
    // Registered by the preload only: the page never gets a way to name dropped paths (SR-12).
    expect(Object.keys(api.drops)).toEqual(['open', 'onReceived']);
    expect(Object.keys(api.quickOpen)).toEqual(['start', 'query', 'open', 'close', 'onResults']);
    expect(Object.keys(api.app)).toEqual(['info', 'resolveSandboxUnavailable', 'installLauncher']);
    expect(Object.keys(api.documents)).toEqual(['read', 'setEncoding', 'followLink', 'back', 'forward', 'resolveImage', 'pathMenu', 'contextMenu', 'save', 'dirty', 'leaveEdit', 'closeAnswer', 'keep', 'recover', 'onEditMode', 'onConfirmClose']);
    expect(Object.keys(api.tabs)).toEqual([
      'snapshot',
      'activated',
      'rendering',
      'rendered',
      'renderAgain',
      'position',
      'zoom',
      'viewState',
      'close',
      'reopenClosed',
      'move',
      'openSettings',
      'onChanged',
      'onDemote',
      'onStale',
    ]);
    expect(Object.keys(api.settings)).toEqual(['get', 'set', 'reset', 'openCustomCss', 'openNoticeFile', 'onChanged']);
    expect(Object.keys(api.profiles)).toEqual(['created', 'undoCreate', 'list', 'open', 'create', 'update', 'delete', 'onChanged']);
  });
});
