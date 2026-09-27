import { describe, expect, it, vi } from 'vitest';
import { buildApi } from './api';

describe('buildApi', () => {
  it('exposes each channel as a method that invokes that channel only', async () => {
    const invoke = vi.fn().mockResolvedValue({ version: '1.2.3' });
    const api = buildApi(invoke);

    await expect(api.app.info()).resolves.toEqual({ version: '1.2.3' });
    expect(invoke).toHaveBeenCalledWith('app.info', []);
  });

  it('exposes no generic invoke or channel access', () => {
    const api = buildApi(vi.fn());

    expect(Object.keys(api)).toEqual(['app', 'documents']);
    expect(Object.keys(api.app)).toEqual(['info', 'resolveSandboxUnavailable']);
    expect(Object.keys(api.documents)).toEqual(['list', 'read', 'followLink', 'back', 'forward', 'resolveImage']);
  });
});
